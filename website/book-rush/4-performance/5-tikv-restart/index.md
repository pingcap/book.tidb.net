---
title: 5. TiKV 节点重启后 leader 平衡加速
hide_title: true
---

# 5. TiKV 节点重启后 leader 平衡加速

TiKV 节点重启后，需要将分布不均匀的 leader 重分配以达到负载均衡的效果。在大规模集群下，leader 平衡时间与 Region 数量正相关。例如，在 100K Region 下，leader 平衡耗时可能达到 20-30 分钟，容易引发负载不均导致的性能问题，造成稳定性风险。TiDB v6.0.0 提供了 leader 平衡的并发度参数控制，并调整默认值为原来的 4 倍，大幅缩短 leader 重平衡的时间，提升 TiKV 节点重启后的业务恢复速度。



在此目录下，你可以撰写针对这些特性的体验和实践文章。
