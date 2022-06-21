---
title: 如何让 TiDB 集群管理“更省心”？TiuniManager（原 TiEM）使用教程来了
hide_title: true
---

# 如何让 TiDB 集群管理“更省心”？TiuniManager（原 TiEM）使用教程来了

作为企业的 TiDB 数据库管理员，日常运维过程中你是否曾经遇到过以下这些难题？

- 规划 TiDB 集群时，需要掌握大量的主机信息（CPU、内存、IP 地址、磁盘类型、磁盘大小），工作量随集群规模线性增加，担心一个人 hold 不住；
- 正式部署 TiDB 集群前，手工修改集群配置项，生怕配置有误影响集群创建；
- TiDB 集群安装过程中，迫切想知道安装流程进行到哪一步了，有没有异常；
- 管理多个 TiDB 集群时，需要记住不同的集群地址，在浏览器上输入不同集群 Dashboard 地址，有时候在不同地址间来回切换、查看集群的监控和性能分析；
- 升级集群时，逐项检查新版本是否引入新参数、老版本参数是否会因升级而变化，担心升级后集群表现异常；
- 所有的运维操作都需要数据库管理员通过命令行工具完成，“黑屏”下命令行的运维方式既缺少规范流程的指引，也无法提供完整的运维历史记录。

总之，分布式数据库系统结构较单机数据库来说更加复杂，日常管理涉及的场景更加丰富多元，部署、维护需要投入不少人力，通常要求数据库管理员掌握 TiDB 生态圈的各项命令工具，具备一定的技术门槛。

TiUniManager（原 TiEM）是为分布式数据库 TiDB 打造的管控平台软件和数据库运维管理平台，主要为 TiDB 提供数据库集群管理功能、主机管理功能和平台管理功能，涵盖了数据库运维人员 (DBA) 在 TiDB 上进行的常用运维操作，帮助 DBA 对 TiDB 进行自动化、自助化和可视化管理。

TiUniManager 可帮助 DBA 避免因人工操作失误导致的数据库故障，保障数据库安全、稳定、高效地运行，降低运维 TiDB 的难度，提升 DBA 工作效率。

自 v1.0.2 版本起，TiUniManager 正式开放源码，详见 GitHub 仓库 [tiunimanager](https://github.com/pingcap/tiunimanager)。

TiUniManager（原 TiEM）覆盖的管理运维场景众多，下面通过 1.0.0 版本中的几个重点功能来了解下 TiUniManager（原 TiEM）。

## 一站式管理多套 TiDB 集群

TiUniManager（原 TiEM）帮助管理员一站式管理多套 TiDB 集群，提供一键式的主机资源管理、集群部署、集群扩缩容、集群启停、数据导入导出、数据同步、备份与恢复、监控告警、性能分析等特性。

相对于过去“黑屏”下命令行方式的管理模式，TiUniManager（原 TiEM）不仅提供可视化交互界面、优化的使用路径、简洁的信息框架，还将不同场景下的规范流程封装到不同功能中，既降低了集群管理的技术门槛，简化了集群运维复杂度，也规范了集群运维操作流程。

<video src="https://asktug.com/uploads/short-url/bLqJExnSNMxObY2FeLDrmLKPZeh.mp4" />

<center> 点击观看视频：TiUniManager（原 TiEM）一站式集群全生命周期管理</center>

## 参数管理

TiDB 参数可分为系统配置和集群配置参数，这两类参数的存储位置、修改方式、作用域范围、修改后生效方式各不相同，加之这两类参数配置数量众多，维护好 TiDB 集群的运行参数并非易事。

TiUniManager（原 TiEM）为 TiDB 各版本提供推荐参数组模板 （包含参数含义的详细解释、取值范围、默认值大小、是否重启的标志位），同时支持用户自定义参数组，帮助管理员沉淀运营最佳实践，形成不同场景下的参数组模块，支持快速应用参数组模板到不同集群，大幅降低数据库运维参数管理复杂度。

日常运维中，数据库管理员常常需要修改 TiDB 配置参数，以便让集群性能与业务模型相匹配，发挥出最优运行效果。TiUniManager（原 TiEM）提供集群运行参数的查看与修改，屏蔽不同类型参数间的修改差异，让管理员能轻松完成参数调整。

<video src="https://asktug.com/uploads/short-url/j4g0vJZNNIL3mFa6Op8JB1u8lE5.mp4" />

<center> 点击观看视频：TiUniManager（原 TiEM）集群参数管理</center>



## 一键克隆集群、一键切换主备集群

TiUniManager（原 TiEM）通过克隆集群可快速创建主备集群，当主集群出现不可用情况时，可通过主备集群切换继续提供服务，保证数据不丢失，是 TiDB 集群高可用性的有力补充。

TiUniManager（原 TiEM）一键克隆集群可帮助管理员快速构建主备集群，并通过在主备集群间自动完成一系列操作（备份主集群、恢复数据到备集群、主备之间建立数据同步任务、主备之间参数复制），保证主备集群之间的数据数据一致，且集群配置参数也一致。

TiUniManager（原 TiEM）主备集群切换实现主集群与备集群之间快速角色切换，自动完成主备集群之间数据同步任务的管理与切换，保证切换期间至少有有一个集群始终可读。

<video src="https://asktug.com/uploads/short-url/u6AY8mvYPiucU4sC3SOwwZQNSKt.mp4" />

<center> 点击观看视频：TiEM 克隆集群与主备集群切换</center>

## 集群原地升级

分布式数据库的版本升级是一项复杂的系统工程，是数据库运维人员一大头痛的问题。TiUniManager（原 TiEM）支持集群一键原地升级，提供集群升级前后参数对比与选择，让升级前后参数变更清清楚楚。TiUniManager（原 TiEM）同时支持滚动升级与强制重启升级两种升级方式，管理员在不同场景下可以选择合适方式进行升级。



<video src="https://asktug.com/uploads/short-url/qpvThPUQFa2ZNiakBwj2HDg4tLv.mp4" />

<center> 点击观看视频：TiUniManager（原 TiEM）集群原地升级</center>



## 来自用户的声音

TiUniManager（原 TiEM）在 TiDB 社区开放小规模的用户试用体验以来，有不少 TiDB 用户开始部署并使用 TiUniManager（原 TiEM），以下是来自部分用户的真实反馈：

- 汽车之家：TiUniManager（原 TiEM）功能全面，覆盖了我们 DBA 日常的操作，日常的运维管理效率提升 50% 以上。
- 联通软件研究院：TiUniManager（原 TiEM）极大地帮助了我们 DBA 减轻管理多套 TiDB 集群的负担。



## 总结

TiUniManager（原 TiEM）作为 TiDB 分布式数据库的图形化管理平台，简化了集群管理复杂度，降低了客户使用 TiDB 及周边生态工具的技术门槛，提升数据库运维人员管理 TiDB 集群效率。让我们携手并进，一起打造“更好用”、“更好管”的 TiDB ！