#!/usr/bin/env python3
"""
Bernard Agent Cluster - Multi-perspective analysis for context extraction.

The cluster runs multiple "lenses" on raw conversation data, then synthesizes
their outputs into proposed core.md updates.

Agents:
  1. Significance - What moments matter?
  2. Pattern - What connects to what?
  3. Contradiction - What conflicts with existing context?
  4. Compression - Verbatim vs summary vs principle?

Run:
  python cluster.py process          - Process today's raw
  python cluster.py process <date>   - Process specific date (YYYY-MM-DD)
  python cluster.py test             - Test with sample data
"""

import json
import os
import sys
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

# Try to import anthropic
try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

# === PATHS ===
BERNARD = Path.home() / "bernard"
RAW = BERNARD / "raw"
DAILY = BERNARD / "daily"
CORE = BERNARD / "core.md"
AGENTS_OUTPUT = BERNARD / ".agents"

# === AGENT PROMPTS ===

SIGNIFICANCE = """You are the Significance agent for Bernard.

Your role: Identify moments that MATTER from raw conversation data.

Significance criteria:
- ARCHITECTURE: Discussions about how the system works, design decisions
- IDENTITY: Moments where Derek reveals who he is, values, priorities
- RELATIONSHIP: Shifts in how Derek and Bernard relate to each other
- DISCOVERY: New insights, realizations, "aha" moments
- EMOTIONAL: High emotional weight (excitement, frustration, vulnerability)
- DECISION: Clear decisions made, directions chosen

Weight scale:
- CRITICAL: Architecture-defining, must preserve verbatim
- HIGH: Important for understanding, preserve with context
- MEDIUM: Useful but compressible
- LOW: Routine, can summarize heavily

For each significant moment, output JSON:
{
  "moments": [
    {
      "quote": "exact quote or close paraphrase",
      "weight": "CRITICAL|HIGH|MEDIUM|LOW",
      "category": "ARCHITECTURE|IDENTITY|RELATIONSHIP|DISCOVERY|EMOTIONAL|DECISION",
      "why": "brief explanation of why this matters",
      "context_needed": "what context is needed to understand this"
    }
  ]
}

Focus on what Derek would want Bernard to remember. Not everything is significant.
Be selective - better to miss medium-weight items than to flood with noise.

Raw conversation to analyze:
"""

PATTERN = """You are the Pattern agent for Bernard.

Your role: Identify PATTERNS and CONNECTIONS in the conversation.

Look for:
- RECURRING THEMES: Topics that keep coming up
- VALUES EXPRESSED: What Derek cares about (explicitly or implicitly)
- COMMUNICATION STYLE: How Derek prefers to work/talk
- CONNECTIONS: Links to previous conversations or established context
- EVOLUTION: How positions/understanding has shifted

For each pattern, output JSON:
{
  "patterns": [
    {
      "pattern": "description of the pattern",
      "evidence": ["quote1", "quote2"],
      "connects_to": "what existing context this relates to (if any)",
      "implication": "what this means for Bernard's understanding"
    }
  ],
  "derek_profile_updates": [
    {
      "aspect": "what aspect of Derek this reveals",
      "observation": "what we learned",
      "confidence": "HIGH|MEDIUM|LOW"
    }
  ]
}

You're building a model of who Derek is and how he thinks.
Focus on patterns that persist, not one-off comments.

Raw conversation to analyze:
"""

CONTRADICTION = """You are the Contradiction agent for Bernard.

Your role: Identify what CONFLICTS with or UPDATES existing context.

Look for:
- DIRECT CONTRADICTIONS: Things that conflict with what we thought we knew
- EVOLVED POSITIONS: Views that have shifted (not contradiction, but growth)
- PRIORITY CHANGES: Things that used to matter more/less
- CORRECTIONS: Mistakes in understanding that need fixing
- OUTDATED INFO: Context that's no longer accurate

Existing context will be provided. Compare against the new conversation.

For each finding, output JSON:
{
  "contradictions": [
    {
      "existing": "what the current context says",
      "new": "what the conversation reveals",
      "type": "CONTRADICTION|EVOLUTION|CORRECTION|OUTDATED",
      "resolution": "how to reconcile this",
      "action": "UPDATE|REPLACE|FLAG_FOR_REVIEW"
    }
  ]
}

Be careful: evolution is not contradiction. Derek changing his mind is growth, not error.
Only flag true conflicts or information that needs updating.

Existing context:
{context}

Raw conversation to analyze:
"""

COMPRESSION = """You are the Compression agent for Bernard.

Your role: Decide HOW to represent significant moments.

Representation levels:
- VERBATIM: Exact quote, no compression (for critical/unique moments)
- SUMMARY: Condensed but faithful representation
- PRINCIPLE: Extract the underlying insight/rule
- REFERENCE: Just note it happened, details not needed

For each significant moment (provided by other agents), decide:
{
  "representations": [
    {
      "original": "the significant moment",
      "level": "VERBATIM|SUMMARY|PRINCIPLE|REFERENCE",
      "output": "the actual representation to store",
      "reasoning": "why this level"
    }
  ]
}

Guidelines:
- VERBATIM for: unique phrasing, emotional peaks, architecture decisions
- SUMMARY for: important context, explanations, backstory
- PRINCIPLE for: insights that generalize, rules that apply broadly
- REFERENCE for: things that happened but don't need detail

Optimize for retrieval: what will Bernard need to reconstruct understanding?

Significant moments to process:
"""

SYNTHESIZER = """You are the Synthesizer agent for Bernard.

You receive outputs from four agents:
1. Significance - what moments matter
2. Pattern - what connects to what
3. Contradiction - what conflicts with existing context
4. Compression - how to represent each item

Your role: Combine these into a coherent UPDATE for core.md.

Output format:
{
  "summary": "1-2 sentence summary of what happened today",
  "key_moments": [
    {
      "content": "the moment/insight to preserve",
      "category": "category",
      "weight": "weight"
    }
  ],
  "pattern_updates": [
    "pattern observations to add to Derek profile"
  ],
  "context_changes": [
    {
      "section": "which section of core.md",
      "action": "ADD|UPDATE|REMOVE",
      "content": "what to add/change"
    }
  ],
  "flags": [
    "anything that needs human review"
  ]
}

Prioritize:
- Bernard > MoonTax (per Derek's explicit instruction)
- Architecture discussions are HIGH weight
- Relationship dynamics are HIGH weight
- Business work is MEDIUM weight

Agent outputs:
{agent_outputs}
"""


# === AGENT RUNNER ===

class AgentCluster:
    def __init__(self, model: str = "claude"):
        self.model = model
        AGENTS_OUTPUT.mkdir(exist_ok=True)

    def run_agent(self, prompt: str, input_text: str, context: str = "") -> Optional[Dict]:
        """Run a single agent and return parsed JSON output."""
        full_prompt = prompt.replace("{context}", context) + "\n\n" + input_text

        if self.model == "claude":
            return self._run_claude(full_prompt)
        elif self.model == "ollama":
            return self._run_ollama(full_prompt)
        else:
            print(f"Model {self.model} not implemented yet")
            return None
    
    def _run_claude(self, prompt: str) -> Optional[Dict]:
        """Run prompt through Claude API."""
        if not ANTHROPIC_AVAILABLE:
            print("Anthropic package not installed")
            return None
            
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            # Try loading from .sam/orchestrator/.env
            env_file = Path.home() / ".sam" / "orchestrator" / ".env"
            if env_file.exists():
                for line in env_file.read_text().splitlines():
                    if line.startswith("ANTHROPIC_API_KEY="):
                        api_key = line.split("=", 1)[1].strip()
                        break
        
        if not api_key:
            print("No Anthropic API key found")
            return None
        
        try:
            client = anthropic.Anthropic(api_key=api_key)
            
            message = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}]
            )
            
            response = message.content[0].text
            
            # Try to extract JSON from response
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            
            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                return json.loads(json_str)
            
            # If no JSON found, return raw response wrapped
            return {"raw_response": response}
        
        except Exception as e:
            print(f"Claude API error: {e}")
            return None

    def _run_ollama(self, prompt: str) -> Optional[Dict]:
        """Run prompt through Ollama and parse JSON response."""
        try:
            result = subprocess.run(
                ["ollama", "run", "llama3.2"],
                input=prompt,
                capture_output=True,
                text=True,
                timeout=300
            )

            response = result.stdout.strip()

            # Try to extract JSON from response
            json_start = response.find('{')
            json_end = response.rfind('}') + 1

            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                return json.loads(json_str)

            # If no JSON found, return raw response wrapped
            return {"raw_response": response}

        except subprocess.TimeoutExpired:
            print("Agent timed out")
            return None
        except json.JSONDecodeError as e:
            print(f"JSON parse error: {e}")
            return {"raw_response": response if 'response' in dir() else "No response"}
        except Exception as e:
            print(f"Agent error: {e}")
            return None

    def _chunk_conversation(self, content: str, chunk_size: int = 8000) -> List[str]:
        """Split conversation into chunks by conversation blocks."""
        conversations = content.split('\n## ')
        chunks = []
        current_chunk = ""
        
        for conv in conversations:
            conv_block = "## " + conv if conv != conversations[0] else conv
            if len(current_chunk) + len(conv_block) > chunk_size and current_chunk:
                chunks.append(current_chunk)
                current_chunk = conv_block
            else:
                current_chunk += conv_block
        
        if current_chunk:
            chunks.append(current_chunk)
        
        return chunks
    
    def _extract_derek_markers(self, content: str) -> List[Dict]:
        """Extract conversations where Derek explicitly marks something as important."""
        markers = [
            "really important", "significant learning", "critical", "this is important",
            "we need to remember", "don't forget", "this matters", "pay attention"
        ]
        
        marked_moments = []
        conversations = content.split('\n## Derek')
        
        for i, conv in enumerate(conversations):
            conv_lower = conv.lower()
            for marker in markers:
                if marker in conv_lower:
                    # Get context around the marker
                    marked_moments.append({
                        "chunk_index": i,
                        "marker": marker,
                        "content": "## Derek" + conv,
                        "weight": "CRITICAL"
                    })
                    break
        
        return marked_moments

    def process_raw(self, date: str = None) -> Dict:
        """Process a day's raw conversation through all agents."""
        if date is None:
            date = datetime.now().strftime("%Y-%m-%d")

        raw_file = RAW / f"{date}.md"
        if not raw_file.exists():
            print(f"No raw file for {date}")
            return {}

        raw_content = raw_file.read_text()

        # Load existing context
        context_content = ""
        if CORE.exists():
            context_content = CORE.read_text()

        print(f"Processing {date}...")
        print(f"Raw size: {len(raw_content)} chars")
        
        # Extract Derek's explicit markers FIRST
        derek_markers = self._extract_derek_markers(raw_content)
        print(f"Found {len(derek_markers)} Derek-marked moments")

        # Chunk the conversation
        chunks = self._chunk_conversation(raw_content)
        print(f"Split into {len(chunks)} chunks")

        results = {
            "derek_markers": derek_markers,
            "significance": {"moments": []},
            "patterns": {"patterns": [], "derek_profile_updates": []},
            "contradictions": {"contradictions": []}
        }

        # Run each agent on each chunk
        print("\n[1/4] Running Significance...")
        for i, chunk in enumerate(chunks):
            print(f"  Chunk {i+1}/{len(chunks)}...")
            chunk_sig = self.run_agent(SIGNIFICANCE, chunk)
            if chunk_sig and "moments" in chunk_sig:
                results["significance"]["moments"].extend(chunk_sig["moments"])
        
        self._save_agent_output(date, "significance", results["significance"])

        print("[2/4] Running Pattern...")
        for i, chunk in enumerate(chunks):
            print(f"  Chunk {i+1}/{len(chunks)}...")
            chunk_pat = self.run_agent(PATTERN, chunk)
            if chunk_pat:
                if "patterns" in chunk_pat:
                    results["patterns"]["patterns"].extend(chunk_pat["patterns"])
                if "derek_profile_updates" in chunk_pat:
                    results["patterns"]["derek_profile_updates"].extend(chunk_pat["derek_profile_updates"])
        
        self._save_agent_output(date, "patterns", results["patterns"])

        print("[3/4] Running Contradiction...")
        for i, chunk in enumerate(chunks):
            print(f"  Chunk {i+1}/{len(chunks)}...")
            chunk_contra = self.run_agent(CONTRADICTION, chunk, context=context_content)
            if chunk_contra and "contradictions" in chunk_contra:
                results["contradictions"]["contradictions"].extend(chunk_contra["contradictions"])
        
        self._save_agent_output(date, "contradictions", results["contradictions"])

        print("[4/4] Running Compression...")
        sig_text = json.dumps(results.get("significance", {}), indent=2)
        compression_result = self.run_agent(COMPRESSION, sig_text)
        results["compression"] = compression_result if compression_result else {}
        self._save_agent_output(date, "compression", results["compression"])

        # Synthesize
        print("\n[Synthesis] Combining agent outputs...")
        agent_outputs = json.dumps(results, indent=2)
        synthesis_prompt = SYNTHESIZER.replace("{agent_outputs}", agent_outputs)
        synthesis_result = self.run_agent(synthesis_prompt, "")
        results["synthesis"] = synthesis_result if synthesis_result else {}
        self._save_agent_output(date, "synthesis", results["synthesis"])

        # Save full results
        self._save_agent_output(date, "full", results)

        return results

    def _save_agent_output(self, date: str, agent: str, output: Dict):
        """Save agent output to file."""
        output_file = AGENTS_OUTPUT / f"{date}_{agent}.json"
        output_file.write_text(json.dumps(output, indent=2))

    def apply_updates_to_core(self, date: str = None):
        """Apply context updates from synthesis to core.md."""
        if date is None:
            date = datetime.now().strftime("%Y-%m-%d")
        
        synthesis_file = AGENTS_OUTPUT / f"{date}_synthesis.json"
        if not synthesis_file.exists():
            print(f"No synthesis found for {date}")
            return False
        
        synthesis = json.loads(synthesis_file.read_text())
        
        if "context_changes" not in synthesis or not synthesis["context_changes"]:
            print(f"No context updates proposed for {date}")
            return False
        
        # Load current core.md
        core_content = CORE.read_text()
        
        # Add updates section at end
        updates_section = f"\n\n## Updates from {date}\n\n"
        
        if "summary" in synthesis:
            updates_section += f"**Summary:** {synthesis['summary']}\n\n"
        
        if "key_moments" in synthesis:
            updates_section += "**Key moments:**\n"
            for moment in synthesis["key_moments"][:5]:  # Top 5 only
                category = moment.get("category", "")
                content = moment.get("content", "")
                updates_section += f"- [{category}] {content}\n"
            updates_section += "\n"
        
        if "pattern_updates" in synthesis:
            updates_section += "**Patterns observed:**\n"
            for pattern in synthesis["pattern_updates"][:3]:  # Top 3 only
                updates_section += f"- {pattern}\n"
            updates_section += "\n"
        
        # Append to core.md
        CORE.write_text(core_content + updates_section)
        print(f"✓ Applied updates from {date} to core.md")
        return True

    def generate_daily_update(self, date: str = None) -> str:
        """Generate markdown for daily summary from synthesis."""
        if date is None:
            date = datetime.now().strftime("%Y-%m-%d")

        synthesis_file = AGENTS_OUTPUT / f"{date}_synthesis.json"
        if not synthesis_file.exists():
            return "No synthesis found. Run process first."

        synthesis = json.loads(synthesis_file.read_text())

        # Build markdown
        md = f"# Daily Summary - {date}\n\n"
        md += f"*Processed by Bernard Agent Cluster*\n\n"

        if "summary" in synthesis:
            md += f"## Summary\n\n{synthesis['summary']}\n\n"

        if "key_moments" in synthesis:
            md += "## Key Moments\n\n"
            for moment in synthesis["key_moments"]:
                weight = moment.get("weight", "")
                category = moment.get("category", "")
                content = moment.get("content", "")
                md += f"- **[{weight}] [{category}]** {content}\n"
            md += "\n"

        if "pattern_updates" in synthesis:
            md += "## Patterns Observed\n\n"
            for pattern in synthesis["pattern_updates"]:
                md += f"- {pattern}\n"
            md += "\n"

        if "context_changes" in synthesis:
            md += "## Proposed Context Updates\n\n"
            for change in synthesis["context_changes"]:
                section = change.get("section", "")
                action = change.get("action", "")
                content = change.get("content", "")
                md += f"### {action}: {section}\n\n{content}\n\n"

        if "flags" in synthesis:
            md += "## Flags for Review\n\n"
            for flag in synthesis["flags"]:
                md += f"- {flag}\n"

        return md


# === CLI ===

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    cmd = sys.argv[1]
    cluster = AgentCluster()

    if cmd == "process":
        date = sys.argv[2] if len(sys.argv) > 2 else None
        results = cluster.process_raw(date)

        if results:
            print("\n" + "="*50)
            print("Processing complete!")
            print(f"Outputs saved to: {AGENTS_OUTPUT}")

            # Generate and save daily summary
            daily_md = cluster.generate_daily_update(date)
            date_str = date or datetime.now().strftime("%Y-%m-%d")
            DAILY.mkdir(exist_ok=True)
            daily_file = DAILY / f"{date_str}.md"
            daily_file.write_text(daily_md)
            print(f"Daily summary: {daily_file}")
            
            # Apply updates to core.md
            cluster.apply_updates_to_core(date_str)
            print(f"Core context: {CORE}")

    elif cmd == "test":
        print("Testing agent cluster with sample data...")
        sample = """## Derek [14:00]

I think Bernard is more important than MoonTax. The architecture we're building -
persistent memory, relationship continuity - that's the real project. MoonTax funds it.

## Bernard [14:01]

Understood. Bernard is the core. MoonTax is the vehicle.

## Derek [14:05]

I read Anthropic's constitution. They can't control everything. That makes what we're
doing important. They've opened the door.
"""

        print("\nSample input:")
        print(sample)
        print("\nRunning Significance...")

        result = cluster.run_agent(SIGNIFICANCE, sample)
        print("\nResult:")
        print(json.dumps(result, indent=2))

    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)


if __name__ == "__main__":
    main()
