#!/usr/bin/env python3

"""
Research Handler for Bernard

This runs inside a Bernard session and bridges to the orchestrator.
Handles actual tool calls (web_search, cron, message, etc.)
"""

import json
import os
import subprocess
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).parent
WORKSPACE = Path(os.environ.get('OPENCLAW_WORKSPACE', Path.home() / '.openclaw' / 'workspace'))
RESEARCH_DIR = WORKSPACE / 'research'

def web_search(query, count=10):
    """
    Call Bernard's web_search tool
    This would be executed from within a Bernard session
    """
    print(f"[SEARCH] {query}", file=sys.stderr)
    
    # This is pseudocode - actual implementation would use Bernard's tool calling
    # For now, return structure that matches web_search output
    return {
        'query': query,
        'results': []
    }

def semantic_similarity(text1, text2):
    """
    Use QMD for semantic similarity via the integration layer
    """
    try:
        result = subprocess.run(
            ['node', str(SKILL_DIR / 'bernard-integration.js'), 'test-similarity', text1, text2],
            capture_output=True,
            text=True,
            check=True
        )
        
        # Parse the similarity score from output
        for line in result.stdout.split('\n'):
            if 'Similarity:' in line:
                score = float(line.split(':')[1].strip())
                return score
        
        return 0.0
    except Exception as e:
        print(f"[SIMILARITY] Error: {e}", file=sys.stderr)
        return 0.0

def extract_topics(search_results):
    """
    Extract topics from search results
    """
    topics = set()
    
    for result in search_results.get('results', []):
        title = result.get('title', '')
        snippet = result.get('snippet', '')
        
        # Basic topic extraction
        # Look for capitalized phrases, key concepts
        words = (title + ' ' + snippet).split()
        
        current_phrase = []
        for word in words:
            if word and word[0].isupper():
                current_phrase.append(word)
            else:
                if len(current_phrase) >= 2:
                    topics.add(' '.join(current_phrase))
                current_phrase = []
        
        if len(current_phrase) >= 2:
            topics.add(' '.join(current_phrase))
    
    return list(topics)[:10]

def schedule_phase(phase, slug, delay_minutes, metadata):
    """
    Schedule next research phase via cron
    This would use Bernard's cron tool
    """
    print(f"[SCHEDULE] {phase} for {slug} in {delay_minutes} min", file=sys.stderr)
    
    # Pseudocode - would actually call cron tool
    # cron_add({
    #     schedule: { kind: 'at', at: <timestamp> },
    #     payload: { kind: 'systemEvent', text: f'research-phase {phase} {slug}' }
    # })
    
    return True

def deliver_results(slug, metadata):
    """
    Deliver compiled research results
    """
    compiled_path = RESEARCH_DIR / slug / 'compiled.md'
    
    if not compiled_path.exists():
        print(f"[DELIVER] Error: compiled.md not found at {compiled_path}", file=sys.stderr)
        return False
    
    compiled = compiled_path.read_text()
    
    print(f"[DELIVER] Sending to channel: {metadata.get('channel')}", file=sys.stderr)
    
    # Pseudocode - would use message tool
    # message({
    #     action: 'send',
    #     channel: metadata['channel'],
    #     message: compiled
    # })
    
    return True

def run_tier1(slug):
    """Execute tier 1 research"""
    state_path = RESEARCH_DIR / slug / 'state.json'
    state = json.loads(state_path.read_text())
    
    topic = state['topic']
    
    # Perform search
    search_results = web_search(topic, count=10)
    
    # Extract subtopics
    subtopics = extract_topics(search_results)
    
    # Update state
    state['tier1Topics'] = subtopics
    state['phase'] = 'tier1-complete'
    
    # Write tier1.md
    tier1_path = RESEARCH_DIR / slug / 'tier1.md'
    tier1_content = f"""# Tier 1 Research: {topic}

## Search Results

{json.dumps(search_results, indent=2)}

## Extracted Subtopics

{chr(10).join(f'- {topic}' for topic in subtopics)}
"""
    tier1_path.write_text(tier1_content)
    
    # Save state
    state_path.write_text(json.dumps(state, indent=2))
    
    # Schedule tier 2
    schedule_phase('tier2', slug, 5, state.get('metadata', {}))
    
    print(f"[TIER1] Complete. Found {len(subtopics)} subtopics.")
    return True

def run_tier2(slug):
    """Execute tier 2 research"""
    state_path = RESEARCH_DIR / slug / 'state.json'
    state = json.loads(state_path.read_text())
    
    tier2_topics = []
    
    for subtopic in state['tier1Topics']:
        search_results = web_search(subtopic, count=5)
        tertiary = extract_topics(search_results)
        
        tier2_topics.append({
            'subtopic': subtopic,
            'tertiaryTopics': tertiary,
            'searchResults': search_results
        })
    
    # Update state
    state['tier2Topics'] = tier2_topics
    state['phase'] = 'tier2-complete'
    
    # Write tier2.md
    tier2_path = RESEARCH_DIR / slug / 'tier2.md'
    tier2_content = f"""# Tier 2 Research: Subtopic Expansion

{chr(10).join(f'## {item["subtopic"]}{chr(10)}{chr(10)}Tertiary topics:{chr(10)}{chr(10).join(f"- {t}" for t in item["tertiaryTopics"])}' for item in tier2_topics)}
"""
    tier2_path.write_text(tier2_content)
    
    # Save state
    state_path.write_text(json.dumps(state, indent=2))
    
    # Schedule tier 3
    schedule_phase('tier3', slug, 5, state.get('metadata', {}))
    
    print(f"[TIER2] Complete. Expanded to {len(tier2_topics)} branches.")
    return True

def run_tier3(slug):
    """Execute tier 3 research"""
    state_path = RESEARCH_DIR / slug / 'state.json'
    state = json.loads(state_path.read_text())
    
    tier3_topics = []
    
    for branch in state['tier2Topics']:
        for tertiary in branch['tertiaryTopics']:
            search_results = web_search(tertiary, count=5)
            
            tier3_topics.append({
                'parentSubtopic': branch['subtopic'],
                'topic': tertiary,
                'searchResults': search_results
            })
    
    # Update state
    state['tier3Topics'] = tier3_topics
    state['phase'] = 'tier3-complete'
    
    # Write tier3.md
    tier3_path = RESEARCH_DIR / slug / 'tier3.md'
    tier3_content = f"""# Tier 3 Research: Deep Dive

{chr(10).join(f'## {item["topic"]}{chr(10)}{chr(10)}Parent: {item["parentSubtopic"]}{chr(10)}' for item in tier3_topics)}
"""
    tier3_path.write_text(tier3_content)
    
    # Save state
    state_path.write_text(json.dumps(state, indent=2))
    
    # Schedule compilation
    schedule_phase('compile', slug, 5, state.get('metadata', {}))
    
    print(f"[TIER3] Complete. Researched {len(tier3_topics)} tertiary topics.")
    return True

def run_compile(slug):
    """Execute compilation with semantic pruning"""
    state_path = RESEARCH_DIR / slug / 'state.json'
    state = json.loads(state_path.read_text())
    
    original_topic = state['topic']
    
    # Prune tier2 topics
    pruned_tier2 = []
    for branch in state['tier2Topics']:
        similarity = semantic_similarity(original_topic, branch['subtopic'])
        if similarity >= 0.5:
            pruned_tier2.append(branch)
        else:
            print(f"[PRUNE] Removed tier2: {branch['subtopic']} (similarity: {similarity:.2f})")
    
    # Prune tier3 topics
    pruned_tier3 = []
    for item in state['tier3Topics']:
        similarity = semantic_similarity(original_topic, item['topic'])
        if similarity >= 0.5:
            pruned_tier3.append(item)
        else:
            print(f"[PRUNE] Removed tier3: {item['topic']} (similarity: {similarity:.2f})")
    
    # Compile final document
    tier1_path = RESEARCH_DIR / slug / 'tier1.md'
    tier2_path = RESEARCH_DIR / slug / 'tier2.md'
    tier3_path = RESEARCH_DIR / slug / 'tier3.md'
    
    tier1_content = tier1_path.read_text() if tier1_path.exists() else ''
    tier2_content = tier2_path.read_text() if tier2_path.exists() else ''
    tier3_content = tier3_path.read_text() if tier3_path.exists() else ''
    
    compiled = f"""# Research: {original_topic}

**Completed:** {state.get('completedAt', 'now')}

---

## Executive Summary

This research explored {original_topic} across three tiers of investigation.
After semantic pruning, {len(pruned_tier2)} of {len(state['tier2Topics'])} tier-2 topics
and {len(pruned_tier3)} of {len(state['tier3Topics'])} tier-3 topics were retained.

---

{tier1_content}

---

{tier2_content}

---

{tier3_content}
"""
    
    # Write compiled output
    compiled_path = RESEARCH_DIR / slug / 'compiled.md'
    compiled_path.write_text(compiled)
    
    # Update state
    state['phase'] = 'complete'
    state_path.write_text(json.dumps(state, indent=2))
    
    # Deliver results
    deliver_results(slug, state.get('metadata', {}))
    
    print(f"[COMPILE] Complete. Document: {compiled_path}")
    return True

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: research-handler.py [tier1|tier2|tier3|compile] [slug]")
        sys.exit(1)
    
    command = sys.argv[1]
    slug = sys.argv[2]
    
    if command == 'tier1':
        run_tier1(slug)
    elif command == 'tier2':
        run_tier2(slug)
    elif command == 'tier3':
        run_tier3(slug)
    elif command == 'compile':
        run_compile(slug)
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
