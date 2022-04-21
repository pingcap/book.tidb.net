---
title: TiEM 初体验
hide_title: true
---

# TiEM 初体验

**作者：pupillord**

## 前言

TiDB 从 4.0 开始推出 TiUP 对 TiDB 集群进行安装部署和运维操作，极大程度的降低了 TiDB 集群的管控复杂度。然而 TiUP 作为一款命令行工具仍然无法完全满足很多人的需求，能不能再简单点呀？能不能有个 UI 界面操作下呀？能不能有个图片看看集群情况呀？能不能一键就完成部署啊？能不能点点点就能自动数据迁移和备份还原等等等？

甲方的需求总是那么的变态但又显得好像很合理的样子，终于 PingCAP 宣布要推出一款 TiDB 管理的界面工具了 —— TiEM，上述的需求好像真的就实现了。

于是满怀好奇和期待的我，立马通过官方渠道发出了试用申请！很快啊，拉群，发安装包，手把手教学，几天不到，就完成了整个 TiEM 的试用体验。包括安装部署 TiEM 工具，导入配置，一键部署，集群操作，数据迁移备份等等，体验还是相当不错滴！

所以下面给大家分享一下 TiEM 工具的体验过程。

## TiEM 架构

TiEM 是支持在线和离线安装的，但是由于目前还没有开放相关的地址，所以试用版是发的 gz 压缩包，还包括配套文件。整个文件 900M 左右。

![img](file:///C:\Users\94531\AppData\Local\Temp\ksohtml\wps6A0A.tmp.jpg) ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1646379378342.png)

安装部署的详细过程这里就不一一截图详述了，直接看看部署后的 EM 架构。

![img](file:///C:\Users\94531\AppData\Local\Temp\ksohtml\wps6A0B.tmp.jpg) ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1646379382911.png)

TiEM 虽然只是一个可视化 TiDB 集群管理工具，但是本身的架构和 TiDB 类似，包含非常多的组件，管理 TiEM 就感觉像在管理 TiDB 集群一样。可以看出来 TiEM 的目标可远远不只是一个管理工具这么简单，未来肯定会根据需求，添加越来越多的组件和服务。

目前 TiEM 集群一共包含 AlterManager，Cluster-Server，Elasticsearch，File-Server，Filebeat，OpenAPI-Server，Jaeger，Kibana，Nginx，Grafana 和 Prometheus 等 11 个组件，看名字都是非常眼熟的一些组件。

可以将其划分成三个主要部分：

1. Cluster-Server，File-Server 和 OpenAPI-Server 组成的 TIEM 本身的主体服务，可以理解成用于对其他组件进行封装集成，统一管理的服务。
2. Elasticsearch，Filebeat 和 Kibana 组成的一套日志文件收集和分析的功能。
3. 监控告警三件套，Grafana，Prometheus 和 AlterManager。

最后还有一个 Jaeger 是用于整体服务调用链路的追踪和分析，毕竟服务太多了。对于这些组件如果感兴趣可以单独去了解一下，而由这些组件组成的 TiEM 整体架构大致如下：

![img](file:///C:\Users\94531\AppData\Local\Temp\ksohtml\wps6A0C.tmp.jpg) ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1646379404290.png)

最上层是 TiEM UI，可视化界面，通过 OpenAPI-Server，和 File-Server 来获取数据，而中间 Business Model 也就是实现 TiEM 管理层面，将下层的基础设施，进行统一封装和管理，当然这里面也包括自身的管理，例如用户，主机，集群的管理等等。TiEM 同时也会封装 TiUP 的所有操作，可以简单理解成将 TiUP 操作可视化，而 TiUP 那一套这里也不做赘述了。

最下层的基础设施中除了我们刚刚在上面看到的一些组件外，还包含有 Sqlite（轻量级数据库）和一个 ETCD（高可用数据库），代表下层也是会做一定的高可用。其中 Sqlite 我理解是用于存一部分的辅助数据，目前还不清楚具体是怎么进行数据的分类和存放。

整个架构是非常清晰明了的四层架构，基础设置 —> 服务集成和封装 —> 公开接口 —> 前端展示。

## TiEM 功能模块

来到大家最关心的部分，就是 TiEM 的使用。在使用之前，因为目前 TiEM 的部分功能没有具体实现，所以在部署完成后，需要直接访问 OpenAPI 来进行初始化，初始化的过程中有两步比较重要。第一步导入主机的规格模板，方便于后期部署的时候，可以给每个 TiDB 节点选择相应的规格，例如 CPU 和内存等。第二步是添加 TiDB 产品，配置每个组件的相关参数的范围，同样是为了创建 TiDB 集群的时候可以选择部署的组件。

完成初始化后，就可以使用内置默认的账号密码登录主页。整个页面风格类似 Dashboard，从左边的菜单栏，可以看到整个系统一共具有四个功能模块：**Resources Management**， **Clusters Management**，**Work Task Management** 和 **System Management.**

### **Resources Management**

主机资源管理，用于所有的虚拟机和物理机管理，可以视作为资源池。通过导入功能，将现有的机器资源导入到资源池中，那么后面在一键部署 TiDB 集群的时候，会通过现有的资源池中，选择合适的机器用于部署相应的节点。

选择合适的机器，主要依靠的是导入主机时给每个主机所定义的标签（Purpose），有三种标签，分别是 Compute（TiDB-Server），Storage（TiKV or TiFlash），Schedule（PD）。

![img](file:///C:\Users\94531\AppData\Local\Temp\ksohtml\wpsE123.tmp.jpg) ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1646379728420.png)

### **Clusters Management**

TiDB 集群管理的功能模块。下面有三个子页面，分别是 Clusters，Import&Export 和 Parameter Groups。

Clusters 可以创建并管理集群，下图是我通过上面的三台主机搭建的一个测试集群。在这个页面，你可以看到该集群的基本信息，同时还集成了 TiDB Dashboard 和 Grafana 的功能进来。整体功能大概有这些：

\1. 集群基本状态和配置查询；

\2. 集成 Dashboard 的性能分析，慢查询和日志分析等；

\3. Grafana 的监控告警配置；

\4. 集群参数的统一查看和修改（这个功能我真的是期待太久了，一直以为会先上 Dashboard）；

\5. 数据备份和同步工具使用；

\6. 克隆集群。

\7. 集群扩缩容操作。

![img](file:///C:\Users\94531\AppData\Local\Temp\ksohtml\wpsE124.tmp.jpg) ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1646380594420.png)

终于，我再也不用在运维的时候，去 Dashboard，Grafana 和 Terminal 之间反复横跳。另外还有两个页面，一个是数据的导入导出，一个是参数组。

参数组可以设置多套自定义参数模板直接应用到部署的 TiDB 集群中，这个功能是相当的赞！毕竟 TiDB 集群和系统参数太多了，而且每个版本还都有差异。在参数组中已经内置了 TiDB 多个版本的默认参数，比起翻文档可来的快多了！

### **WorkFlow Task Management**

在这个页面，会将所有的工作流进行记录，所谓工作流，就是我们在 TiEM 里面的操作任务，例如导入物理机，创建集群，删除集群等等都会作为一个工作流去执行。所以我们在这个页面能够知道历史的操作记录，还有每个任务的执行详情，是否成功。如果有任务失败了，可以点进去查看任务运行的每一步，具体是到哪一步的时候失败的，方便于我们进行问题排查。

在本次测试集群部署的时候遇到的很多问题，都是通过工作流记录来排查的，很实用的一个功能。

![img](file:///C:\Users\94531\AppData\Local\Temp\ksohtml\wpsE125.tmp.jpg) ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1646379870877.png)

### **Systems Management**

最后一个大模块是系统管理，这个模块和 TiDB 集群没有关系，而是针对于 TiEM 本身的一个管理模块。

很直观就能看到，有三个子页面，**System Monitor**，**Systems Logs** 和 **System Tracer**。用户可以通过系统监控，日志分析和调用链路追踪三个维度去查看整个 TiEM 系统目前的运行状态，基本是全方位的工具都用上了。如果 TiEM 系统层面出现任何问题，通过这些来进行排查会非常的方便。

那么作为一个 DBA 也可以简单的将 TiEM 作为一个特殊的 "TiDB Cluster" 来进行日常运维和问题排查。

![img](file:///C:\Users\94531\AppData\Local\Temp\ksohtml\wpsE126.tmp.jpg) ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1646380025705.png)

## 体验感想

体验 TiEM 平台，虽然还有部分高级功能没有测试到，但是基本的功能都走了一遍（这里很感谢 PingCAP 的技术支持人员，非常耐心的解答了很多问题）。抛开内部功能的具体实现不说，单纯就集成 TiDB 众多周边工具的统一平台，其实意义已经非常大了。何况 TiEM 的功能实现基本也都满足了我的预期，部分功能甚至超出了我的预期，例如像工作流和参数组的功能。

大致的一些功能在上文都给大家介绍了一遍，下面谈谈 TiEM 这个平台目前 1.0.0 版本还有那些不足和我的小建议。

- 初始化集群时的页面操作，这一块目前是 curl 手动调 OpenAPI 完成的，后期应该会很快就补上前端页面；
- TiEM 本身的用户组模块，目前只有内置管理员，通过交流了解，已经设计了一套基于 RBAC 模型的权限管理，下个版本应该会推出；
- 在资源管理页面中，对于导入的主机配置无法进行修改，只能导入和删除，如果机器发生变化或者导入失败，只能删除再重新导入；
- 一键部署时无法为 TiDB 节点选择指定机器，只能设置 Purpose 标签，系统自动按照 Purpose 选择机器。同时一个挂载盘只允许一个节点，也就是一台机器上如果你想要多个节点，必须给每个节点配置一个挂载盘。这两点在部署时比较僵硬，很难满足各种部署场景；
- 工作流中，没有重放或者重试的功能，例如我某一系列操作，中间出现问题失败了，解决这个问题之后，我需要重新操作一遍。如果对于这个工作流，能够直接重放或者重试会好很多；
- 建议在主机管理页面，增加一个连接到服务器终端的功能，通过这个功能可以在页面对服务器进行一些指令操作。方便后面如果排查出服务器相关问题，能够直接登上去操作。

当然除此之外，还有遇到了一些小 bug，都已经反馈给技术人员了，帮助他们完善 TiEM 产品。在这一波体验之后，我对 TiEM 这个平台的正式发布可以说是相当期待的，同时更期待的是，会不会进行开源呢？让咱们也能给这个 TiEM 平台添砖加瓦。
