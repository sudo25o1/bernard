# Clustering with Bernard

Bernard supports local model clustering via [Exo](https://github.com/exo-explore/exo), an open source AI clustering framework that enables RDMA over Thunderbolt 5.

## Why Cluster?

Clustering becomes relevant when:

- Running models locally on your hardware (privacy, no API costs, offline capability)
- Models are too large for one machine (need VRAM pooling across devices)
- Faster inference by distributing workload across machines

If Bernard is configured to use external APIs (Anthropic, OpenAI, etc.), clustering doesn't apply. This is for local inference workloads.

## Hardware Requirements

- **macOS 26.2 or later** (introduced RDMA over Thunderbolt 5 in December 2025)
- **Thunderbolt 5 capable Macs:**
  - M4 Pro Mac mini
  - M4 Max Mac Studio
  - M4 Max MacBook Pro
  - M3 Ultra Mac Studio
- **TB5 cables** connecting all machines in a full mesh topology
  - 2 machines = 1 cable
  - 4 machines = 6 cables (every machine connected to every other machine)
  - No TB5 switch exists yet, so direct connections required

## Exo Overview

[Exo](https://github.com/exo-explore/exo) (Apache 2.0 license) handles:

- Automatic device discovery (zero config)
- VRAM pooling across all machines (e.g., 1.5TB unified memory with 4 Mac Studios)
- Automatic model sharding (tensor parallelism)
- Built-in dashboard at `localhost:52415`
- MLX backend (Apple's inference framework)

### Performance

With RDMA over TB5:

- 80 Gbps bandwidth (vs 40 Gbps TCP baseline)
- 99% reduction in latency between devices
- 1.8x speedup on 2 devices, 3.2x on 4 devices (tensor parallelism)

Benchmarks from Jeff Geerling's 4x Mac Studio cluster:

- Qwen3-235B (8-bit)
- DeepSeek v3.1 671B (8-bit)
- Kimi K2 Thinking (4-bit)

## Setup

### 1. Enable RDMA (one-time per machine)

1. Shut down Mac
2. Hold power button for 10 seconds until boot menu appears
3. Select "Options" (Recovery mode)
4. Open Terminal from Utilities menu
5. Run: `rdma_ctl enable`
6. Reboot

### 2. Install Exo

```bash
git clone https://github.com/exo-explore/exo
cd exo/dashboard && npm install && npm run build && cd ..
uv run exo
```

Run this on each machine. They will discover each other automatically.

### 3. Access Dashboard

Open `http://localhost:52415` on any machine in the cluster.

## Architecture

Bernard sits on top of Exo as the interface and orchestration layer:

- **Exo:** Low-level RDMA clustering, model sharding, VRAM pooling
- **Bernard:** User interface, memory/context management, tool orchestration

When local inference is enabled, Bernard routes requests to the local Exo cluster instead of external APIs.

## Roadmap

- [ ] Mac Studio M3 Ultra arrives (~March 2026)
- [ ] Enable RDMA on Bernard (this machine) and Samantha
- [ ] Install Exo on both machines
- [ ] Verify clustering and RDMA performance
- [ ] Integrate Exo as Bernard's local inference backend
- [ ] Document model deployment workflows
- [ ] Test with production workloads

## References

- [Exo GitHub](https://github.com/exo-explore/exo)
- [Jeff Geerling: 1.5 TB VRAM on Mac Studio](https://www.jeffgeerling.com/blog/2025/15-tb-vram-on-mac-studio-rdma-over-thunderbolt-5)
- [macOS 26.2 RDMA announcement](https://appleinsider.com/articles/25/12/20/ai-calculations-on-mac-cluster-gets-a-big-boost-from-new-rdma-support-on-thunderbolt-5)
