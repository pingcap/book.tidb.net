---
title: 1. HTAP 最佳实践
hide_title: true
---

# 1. HTAP 最佳实践

## 更成熟的 HTAP 能力

TiDB 5.0 是其分析引擎架构初步成型的版本，这个版本中我们引入了 MPP 执行模式，从而得以服务于更广的用户场景。这一年来 TiDB HTAP 也经受了严苛的考验，无论是双十一场景下数十万 TPS 写入合并数十张实时报表中高频刷新，交易分析混合下优化器自动路由完成的高并发数据服务，这些用例都成为 TiDB HTAP 不断成熟的依托。相较 TiDB 5.0，最新版本中分析引擎 TiFlash 拥有了：

- 更多算子和函数支持：相较 5.0，TiDB 分析引擎新增加了 110 多个常用内建函数以及若干表关联算子。这将使得更多计算能享受 TiDB 分析引擎的加速带来的数量级性能提升。
- 更优的线程模型：在 MPP 模式下，以往 TiDB 对于线程资源是相对无节制的。这样实现的后果是，当系统需要处理较高并发的短查询时，由于过多的线程创建和销毁带来的开销，系统无法将 CPU 资源用满，从而带来大量资源浪费。另外，当进行复杂计算的时候，MPP 引擎也会占用过多线程，带来性能和稳定性的双重问题。针对这个问题，最新版中引入了全新的弹性线程池，并对算子持有线程的方式进行了较大重构，这使得 TiDB MPP 模式下的资源占用更为合理，在短查询下达到同等计算资源倍增的计算性能，且在高压力查询时稳定性更佳。
- 更高效的列存引擎：通过调整存储引擎底层文件结构和 IO 模型，优化了访问不同节点上副本和文件区块的计划，优化了写放大以及普遍的代码效率。经客户实景验证，在极高读写混合负载下提升超过 50%～100% 以上并发能力，同等负载下大幅度降低 CPU / 内存资源使用率。



## TiFlash 最新特性

- TiFlash MPP 引擎支持分区表的动态裁剪模式（实验特性）

  在该模式下，TiDB 也可以使用 TiFlash MPP 引擎读取和计算分区表的数据，从而大大提升分区表的查询性能。

  [用户文档](https://docs.pingcap.com/zh/tidb/v6.0/use-tiflash#mpp-模式访问分区表)

  

- TiFlash 新增支持 zstd 压缩算法

  新增 `profiles.default.dt_compression_method` 和 `profiles.default.dt_compression_level` 两个参数，用户可根据对性能和容量的平衡，选择不同的压缩算法。

  [用户文档](https://docs.pingcap.com/zh/tidb/v6.0/tiflash-configuration#配置文件-tiflashtoml)

  

- TiFlash 默认开启支持所有 I/O 的校验 (Checksum)。

  此项功能曾作为实验特性在 v5.4 释出。除增强了数据的正确性安全性外，对用户使用不产生明显的直接影响。

  警告：新版本数据格式将不支持原地降级为早于 v5.4 的版本，需要在降级处理时删除 TiFlash Replica 待降级完成后重新同步；或使用[离线工具进行数据版本降级](https://docs.pingcap.com/zh/tidb/v6.0/tiflash-command-line-flags#dttool-migrate)。

  [用户文档](https://docs.pingcap.com/zh/tidb/v6.0/use-tiflash#使用数据校验)

  

- TiFlash 引入异步 gRPC 和 Min-TSO 调度机制，更好的管理线程使用，防止线程数过高导致的系统崩溃。

  [用户文档](https://docs.pingcap.com/zh/tidb/v6.0/monitor-tiflash#coprocessor)



## 章节目录

- [TiFlash 6.0 on K8s 扩容与新特性实践](1-tiflash-6-0-on-k8s.md) By [张田](https://tidb.net/u/%E6%95%B0%E6%8D%AE%E5%B0%8F%E9%BB%91/post/all)
