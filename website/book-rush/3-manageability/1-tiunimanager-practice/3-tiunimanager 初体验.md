---
title: TiUniManager（原 TiEM）初体验
hide_title: true
---

# TiUniManager（原 TiEM）初体验

> 作者简介：江坤（pupillord），刚出道的后端开发工程师，会一点 golang，会一点 vue，兼职DBA 。

> 个人主页：[AskTug](https://tidb.net/u/pupillord/answer)

> Github 账号：[pupillord](https://github.com/pupillord)

## 前言

自 v1.0.2 版本起，TiEM 改名为 TiUniManager，并正式开放源码，详见 GitHub 仓库 [tiunimanager](https://github.com/pingcap/tiunimanager)。

TiDB 从 4.0 开始推出 TiUP 对 TiDB 集群进行安装部署和运维操作，极大程度的降低了 TiDB 集群的管控复杂度。然而 TiUP 作为一款命令行工具仍然无法完全满足很多人的需求，能不能再简单点呀？能不能有个UI界面操作下呀？能不能有个图片看看集群情况呀？能不能一键就完成部署啊？能不能点点点就能自动数据迁移和备份还原等等等？

甲方的需求总是那么的变态但又显得好像很合理的样子，终于 PingCAP 宣布要推出一款 TiDB 管理的界面工具了 —— TiEM，上述的需求好像真的就实现了。

于是满怀好奇和期待的我，立马通过官方渠道发出了试用申请！很快啊，拉群，发安装包，手把手教学，几天不到，就完成了整个TiEM的试用体验。包括安装部署TiEM工具，导入配置，一键部署，集群操作，数据迁移备份等等，体验还是相当不错滴！

所以下面给大家分享一下 TiEM 工具的体验过程。

## TiEM架构

TiEM是支持在线和离线安装的，但是由于目前还没有开放相关的地址，所以试用版是发的gz压缩包，还包括配套用户文档。整个文件 800M 。

![TiEM文件.jpg](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/TiEM文件-1655450198664.jpg)

安装部署的详细过程这里就不一一截图详述了，直接看看部署后的EM架构。

![servers.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/servers-1655450211783.png)

TiEM虽然只是一个可视化TiDB集群管理工具，但是本身的架构和TiDB类似，包含非常多的组件，管理TiEM就感觉像在管理TiDB集群一样。可以看出来TiEM的目标可远远不只是一个管理工具这么简单，未来肯定会根据需求，添加越来越多的组件和服务。

目前TiEM集群一共包含AlterManager，Cluster-Server，Elasticsearch，File-Server，Filebeat，OpenAPI-Server，Jaeger，Kibana，Nginx，Grafana和 Prometheus等11个组件，看名字都是非常眼熟的一些组件。

可以将其划分成三个主要部分：

1. Cluster-Server，File-Server和 OpenAPI-Server 组成的TIEM本身的主体服务，可以理解成用于对其他组件进行封装集成，统一管理的服务。

2. Elasticsearch，Filebeat 和 Kibana 组成的一套日志文件收集和分析的功能。

3. 监控告警三件套，Grafana，Prometheus 和 AlterManager。

最后还有一个 Jaeger 是用于整体服务调用链路的追踪和分析，毕竟服务太多了。对于这些组件如果感兴趣可以单独去了解一下，而由这些组件组成的TiEM整体架构大致如下：

![架构.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/架构-1655450235770.png)

最上层是 TiEM UI，可视化界面，通过 OpenAPI-Server，和 File-Server 来获取数据，而中间 Business Model 也就是实现TiEM管理层面，将下层的基础设施，进行统一封装和管理，当然这里面也包括自身的管理，例如用户，主机，集群的管理等等。TiEM同时也会封装TiUP的所有操作，可以简单理解成将TiUP操作可视化，而TiUP那一套这里也不做赘述了。

最下层的基础设施中除了我们刚刚在上面看到的一些组件外，还包含有 Sqlite（轻量级数据库）和一个 ETCD（高可用数据库），代表下层也是会做一定的高可用。其中Sqlite我理解是用于存一部分的辅助数据，目前还不清楚具体是怎么进行数据的分类和存放。

整个架构是非常清晰明了的四层架构，基础设置 —> 服务集成和封装 —> 公开接口 —> 前端展示。

## TiEM 初始化

在使用之前，需要初始化 TiEM 服务。在最早的 1.0.0 版本中初始化的 UI 没有实现，需要直接访问 OpenAPI 来进行初始化。目前最新的 1.0.1 版本中已经可以通过图形化界面来初始化了，初始化主要分为两个部分，导入服务器配置和添加 TiDB 产品。

![初始化.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/初始化-1655453374301.png)

**导入服务器配置**

第一步导入主机的规格模板，这个地方主要是服务器的分布情况和硬件配置。了解现有的机架，数据中心和地区可以在部署 TiDB 集群时，使用最佳的高可用方案。而机器配置则方便于每个 TiDB 组件的部署选择，毕竟不同的组件对于 CPU 和内存都有不同的要求。 下面我在一个 Region 中创建了两个 Zone，分别为 Zone1\_1, Zone1\_2。注意这里的 Region 可不是 TiDB 的 Region 概念，而是一个大的区域概念。

![导入服务器1.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/导入服务器1-1655453417204.png)

导入主机的时候，有三种标签，分别是 Compute，Storage，Schedule，这里分别对应的 TiDB-Server, TiKV or TiFlash 和 PD 三种节点的适用机器。方便起见，我每个标签的机器都只导入了一种 16C64G 机器型号，如下图：

![导入服务器2.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/导入服务器2-1655453431925.png)

**添加 TiDB 产品**

下一步就是加入 TIDB 的组件，并配置每个组件的部署参数，目前每个组件的参数都是一样的。下面以 PD 组件为例，其实可供调控的也就只有 Rang of Ports（端口的取用范围）。

- Component Purpose 表示组件能够部署的服务器标签，也就是在上一步中我们导入服务器时看到的标签，这里 PD 对应的就是 Schedule，那么在后面部署集群到时候，PD 节点也就只会部署到 Schedule 标签里的服务器中。

- Available Number of Instance 表示允许选择的主机数量，就是一个集群中部署 PD 节点的数量，PD 的建议数量为单数，所以提供 1，3，5，7 作为选择。

- Number of Ports per Instance 表示每个主机上允许使用的端口数量，也就是每个主机上允许部署的 PD 节点最大数量，这里固定是 8，也就是单个机器上最多部署 8 个 PD 节点。

- Range of Ports 表示每个主机上节点能够选择的端口范围，PD 的为10040 - 10120

![添加产品1.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/添加产品1-1655453496963.png)

这里按照默认配置导入 TiDB 的产品，最后还有选择 TiDB 的可用版本，我直接拉满，因为我是在线镜像源，一般生产环境是离线镜像源则需要根据自己 TiEM 配置镜像源中的可用 TiDB 版本来选择。

![添加产品2.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/添加产品2-1655453648190.png)

## TiEM 功能模块

终于来到大家最关心的部分，TiEM 功能模块。我们直接使用内置默认的账号密码登录主页。整个页面风格类似 Dashboard，从左边的菜单栏，可以看到四个大的功能模块：资源管理（Resources Management），集群管理（Clusters Management），工作流任务管理（WorkFlow Task Management）和系统管理（System Management）。

### **资源管理**

主机资源管理，用于所有的虚拟机和物理机管理，可以视作为资源池。通过导入功能，将现有的机器资源导入到资源池中，那么后面在一键部署 TiDB 集群的时候，会通过现有的资源池中，选择合适的机器用于部署相应的节点。

选择合适的机器，主要依靠的是导入主机时给每个主机所定义的标签（Purpose），也就是是 Compute（TiDB-Server），Storage（TiKV or TiFlash），Schedule（PD）。

导入的方法是填写一个 Excel 表格，将服务器信息一一填写进去，导入即可，Excel 模板可以在导入界面下载。

![导入机器.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/导入机器-1655454083885.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655454103265.png)

### **集群管理**

TiDB集群管理的功能模块。下面有三个子页面，分别是 Clusters，Import\&Export 和 Parameter Groups。

Clusters 可以创建并管理集群，创建集群的方法就非常简单了，我们只需要填写一个表单。表单有两种，一种是轻松创建，会使用 TiDB 官方推荐的最佳数据库配置参数。还有一种是标准创建，那么你可以能需要更细节的选择每个组件实例部署的位置，服务器数量，节点数量。生产环境或者存在比较复杂的混部情况下，我们会选择标准部署，这里选择轻松创建，看一下 TiEM 自动规划的最佳配置效果如何。

![部署集群1.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/部署集群1-1655454171435.png)

填写数据库基础信息，选择数据库版本还有参数组，资源分配上我也是选的自动分配，就不一一手动调控了。

![部署集群2.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/部署集群2-1655454344525.png)

下图是每个节点自动分配服务器和节点数量，可用区和规格代码就是我们初始化集群的时候导入的服务器信息。仔细看 TiKV 会发现上面还多了一个副本数的选择。

![部署集群3.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/部署集群3-1655454354864.png)

最后是填写集群相关的信息，集群名称，集群标签，数据库用户密码和是否独占部署，独占部署表示分配的机器上只会部署这一个集群的组件，不会和别人集群混部。

![部署集群4.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/部署集群4-1655454369428.png)

填完表单后，点击提交，耐心的等待一会，我们就可以得到一个新的 TiDB 集群了！只需要点点点就能部署一个 TiDB 集群感觉真的太爽了，当然细节的把控程度上可能稍微差一点。

最后我们就可以看一下通过三台主机搭建的测试集群：

![集群png.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/集群png-1655454381267.png)

在集群管理页面，可以看到该集群的基本信息，同时还集成了 TiDB Dashboard 和 Grafana 的功能进来。整体功能大概有这些：

1. 集群基本状态和配置查询；
2. 集成 Dashboard 的性能分析，慢查询和日志分析等；
3. Grafana 的监控告警配置；
4. 集群参数的统一查看和修改（这个功能我真的是期待太久了，一直以为会先上 Dashboard ）；
5. 数据备份和同步工具使用；
6. 克隆集群；
7. 集群扩缩容操作。

终于，我再也不用在运维的时候，去Dashboard，Grafana 和 Terminal 之间反复横跳。另外在集群管理的菜单栏下还有两个页面，一个是数据的导入导出，另一个是参数组。

导入导出属于基本功能，而这里需要重点强调一下的是参数组功能。我们可以设置多套自定义参数模板直接应用到部署的 TiDB 集群中，也可以选择系统某人的参数组。这个功能绝对是管理大量 TiDB 集群的利器，毕竟 TiDB 集群版本和系统参数太多了，每个版本的参数都有一定差异。TiEM 在参数组中已经内置了 TiDB 多个版本的默认参数，这个比起翻文档可来的快多了。

![参数组.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/参数组-1655454459768.png)

### **工作流任务管理**

在这个页面，会将所有的工作流进行记录，所谓工作流，就是我们在 TiEM 里面的操作任务，例如导入物理机，创建集群，删除集群等等都会作为一个工作流去执行。所以我们在这个页面能够知道历史的操作记录，还有每个任务的执行详情，是否成功。如果有任务失败了，可以点进去查看任务运行的每一步，具体是到哪一步的时候失败的，方便于我们进行问题排查。

在本次测试集群部署的时候遇到的很多问题，都是通过工作流记录来排查的，一个很实用的功能。但是有些不足是目前工作流只能用来进行查看，排查问题，并没有支持更多的操作，例如回放，重试等功能。

![工作流管理.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/工作流管理-1655454444867.png)

### **系统管理**

最后一个大模块是系统管理，这个模块和 TiDB 集群没有关系，而是针对于 TiEM 本身的一个管理模块。

很直观就能看到，有三个子页面，**System Monitor**，**Systems Logs** 和 **System Tracer**。用户可以通过系统监控，日志分析和调用链路追踪三个维度去查看整个 TiEM 系统目前的运行状态，基本是全方位的工具都用上了。如果 TiEM 系统层面出现任何问题，通过这些来进行排查会非常的方便。

那么作为一个 DBA 也可以简单的将 TiEM 作为一个特殊的 "TiDB Cluster" 来进行日常运维和问题排查。

![监控.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/监控-1655454420211.png)

## 体验感想

体验 TiEM 平台，虽然还有部分高级功能没有测试到，但是基本的功能都走了一遍（这里很感谢 PingCAP 的技术支持人员，非常耐心的解答了很多问题）。抛开内部功能的具体实现不说，单纯就集成 TiDB 众多周边工具的统一平台，其实意义已经非常大了。何况 TiEM 的功能实现基本也都满足了我的预期，部分功能甚至超出了我的预期，例如像工作流和参数组的功能。

大致的一些功能在上文都给大家介绍了一遍，下面谈谈 TiEM 这个平台目前版本存在的一些问题：

- TiEM 本身的用户组模块，目前只有内置管理员，通过和开发人员的交流了解，已经设计了一套基于 RBAC 模型的权限管理，下个版本应该会推出；

- 在资源管理页面中，对于导入的主机配置无法进行修改，只能导入和删除，如果机器发生变化或者导入失败，只能删除再重新导入；

- 一键部署时无法为 TiDB 节点选择指定机器，只能设置 Purpose 标签，系统自动按照 Purpose 选择机器。同时一个挂载盘只允许一个节点，也就是一台机器上如果你想要多个节点，必须给每个节点配置一个挂载盘。这两点在部署时比较僵硬，很难满足各种部署场景；

- 工作流中，没有重放或者重试的功能，例如我某一系列操作，中间出现问题失败了，解决这个问题之后，我需要重新操作一遍。如果对于这个工作流，能够直接重放或者重试会好很多；

- 建议在主机管理页面，增加一个连接到服务器终端的功能，通过这个功能可以在页面对服务器进行一些指令操作。方便后面如果排查出服务器相关问题，能够直接登上去操作。

当然除此之外，还有遇到了一些小 bug，都已经反馈给技术人员了，帮助他们完善 TiEM 产品。经过这一波体验，我对与 TiEM 平台后面的发展非常期待，希望能有更多的功能加入进来。
