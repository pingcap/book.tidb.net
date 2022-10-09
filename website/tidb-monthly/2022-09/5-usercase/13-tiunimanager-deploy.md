---
title: TiUniManager 部署和使用感受 - TiDB 社区技术月刊
sidebar_label: TiUniManager 部署和使用感受
hide_title: true
description: TiUniManager是6.x推出的新功能，为分布式数据库 TiDB 打造的管控平台软件和数据库运维管理平台，主要为 TiDB 提供数据库集群管理功能、主机管理功能和平台管理功能，涵盖了数据库运维人员 (DBA) 在 TiDB 上进行的常用运维操作，帮助 DBA 对 TiDB 进行自动化、自助化和可视化管理。简化运维上的命令行上管理的繁琐步骤，实现图形化一键操作完成对 TiDB 的部署运维相关工作。
keywords: [TiDB, TiUniManager, 运维, DBA]
---

# TiUniManager部署和使用感受

> 作者：gary

原创[安装 & 部署](https://tidb.net/blog/tag/install-and-deploy)[集群管理](https://tidb.net/blog/tag/cluster-management)[6.x 实践](https://tidb.net/blog/tag/6.x-practice)

## 前言

TiUniManager是6.x推出的新功能，为分布式数据库 TiDB 打造的管控平台软件和数据库运维管理平台，主要为 TiDB 提供数据库集群管理功能、主机管理功能和平台管理功能，涵盖了数据库运维人员 (DBA) 在 TiDB 上进行的常用运维操作，帮助 DBA 对 TiDB 进行自动化、自助化和可视化管理。简化运维上的命令行上管理的繁琐步骤，实现图形化一键操作完成对 TiDB 的部署运维相关工作。

## TiUniManager 产品架构图

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1661662570966.png)


## 软硬件环境配置

### 1.Linux操作系统版本要求

要部署和运行 TiUniManager 服务，确保 Linux 操作系统的版本满足以下要求：

Linux 操作系统平台 版本 Red Hat Enterprise Linux 7.3 及以上的 7.x 版本 CentOS 7.3 及以上的 7.x 版本

### 2.软件配置要求)

TiUniManager 中控机是运行TiUniManager 服务的中央控制节点，用户通过登录TiUniManager中控机上的 Web console 或 OpenAPI 完成对 TiDB 集群的日常管理。 


### 3.TiUniManager中控机软件配置

| 软件    | 版本        |
| ------- | ----------- |
| sshpass | 1.06 及以上 |
| TiUP    | 1.9.0及以上 |


### 4.服务器建议配置

服务器硬件配置要求如下：

| 组件         | CPU    | 内存    | 硬盘类型 | 网络                 | 实例数量 (最低要求) |
| ------------ | ------ | ------- | -------- | -------------------- | ------------------- |
| TiUniManager | 48 核+ | 128 GB+ | SAS/SSD  | 万兆网卡（2 块最佳） | 1                   |


### 5.网络要求

TiUniManager 正常运行需要网络环境提供如下端口配置，网络侧和主机侧开放相关端口：

| 组件                   | 默认端口     | 说明                                         |
| ---------------------- | ------------ | -------------------------------------------- |
| Web server             | 4180 或 4183 | HTTP 端口：4180HTTPS 端口： 4183             |
| OpenAPI server         | 4100 或 4103 | OpenAPI 服务端口: 4100OpenAPI 监控端口: 4103 |
| Cluster server         | 4101 或 4104 | 集群服务端口                                 |
| File server            | 4102 或 4105 | 文件上传或下载的服务器端口                   |
| etcd                   | 4106 或 4107 | etcd 服务端口                                |
| Elasticsearch server   | 4108         | Elasticsearch 服务端口                       |
| Kibana server          | 4109         | Kibana 服务端口                              |
| Prometheus             | 4110         | Prometheus 服务端口                          |
| Grafana server         | 4111         | Grafana 服务端口                             |
| Alertmanager server    | 4112 或 4113 | 告警管理服务端口                             |
| Jaeger(tracer server ) | 4114 到 4123 | Jaeger 服务端口                              |
| node_exporter          | 4124         | TiUniManager 主机系统上报信息的通信端口      |

 

### 6.客户端 Web 浏览器要求

可在较新版本的常见桌面浏览器中使用 TiUniManager，浏览器的版本要求如下：

- Chrome > 79
- Firefox > 72
- Microsoft Edge > 79
- Safari > 14

 注意：若使用旧版本浏览器或其他浏览器访问 TiUniManager，部分界面可能无法正常工作。


## 离线部署 TiUniManager

1.通过 `https://download.pingcap.org/em-enterprise-server-${version}-linux-amd64.tar.gz` 下载离线安装包

2.发送 TiUniManager 离线安装包至 TiUniManager 中控机。

离线安装包放置于 TiUniManager中控机，使用具有 sudo 权限的账号执行后续操作。

3.解压 TiUniManager 离线包。

tar zxvf em-enterprise-server-${version}-linux-amd64.tar.gz

4.安装 TiUniManager。进入解压后的目录，执行 `install.sh` 脚本。

sudo sh em-enterprise-server-v1.0.2-linux-amd64/install.sh  {TiUniManager中控机IP}

5.声明环境变量

\# 切换到 tidb 账号下 

su - tidb 

\# 声明环境变量，使 tiup 工具生效 

source /home/tidb/.bash_profile

6.生成 tidb 帐户下的密钥

\# 切换到 tidb 账号下 

su - tidb 

\# 生成 rsa 密钥

 ssh-keygen -t rsa 

\# 复制密钥到 tiup_rsa 

cp /home/tidb/.ssh/id_rsa /home/tidb/.ssh/tiup_rsa

7.编辑拓扑配置文件。根据实际环境，你可编辑位于 `/home/tidb/` 下的拓扑配置文件 `config.yaml`

8.执行命令部署TiUniManager

 \#切换到 tidb 账号下

 su - tidb

\# 部署名称为 “em-test” 的 TiUniManager

TIUP_HOME=/home/tidb/.em tiup em deploy em-test 1.0.2 /home/tidb/config.yaml -utidb -p

 \# 部署名称为 "em-test" 的TiUniManager，注意这里的版本号不带 v，比如 v1.0.2 的版本号，正确的输入是 1.0.2

\# 启动 TiUniManager

TIUP_HOME=/home/tidb/.em tiup em start em-test

\#查看集群状态

 TIUP_HOME=/home/tidb/.em tiup em display em-test

9.导入TiDB Server离线镜像包

离线环境下，需要在 TiUniManager中控机本地目录上导入 TiDB 离线镜像包，否则无法通过 TiUniManager 中控机完成对 TiDB 集群的日常管理。

 \# 切换到 tidb 账号下 

su - tidb 

\# 下载解压 TiDB Server 离线镜像包，将 ${version} 手动替换为实际的 TiDB 版本号。

tar zxvf tidb-enterprise-server-${version}-linux-amd64.tar.gz

\# 导入离线镜像包

 TIUP_HOME=/home/tidb/.tiup tiup mirror merge tidb-enterprise-server-${version}-linux-amd64

 10.在TiUniManager中控机查看本地镜像源

TIUP_HOME=/home/tidb/.tiup tiup mirror show

## TiUniManager 控制台相关操作

- 登录 TiUniManager

 操作步骤 

1. 在浏览器中输入 TiUniManager 地址，跳转至登录页面。

2. 在登录页面输入用户名和密码。默认用户名为 admin，密码为 admin。 

3. 点击登录按钮进行登录并跳转至概览页面。

4. 第一次登录会提示修改登录密码

- 导入主机

操作步骤

1. 登录控制台。

2. 进入资源管理页面。

3. 点击导入主机按钮。

4. 点击下载主机模板按钮。

5. 双击打开模板，并按照模板填入相应信息并保存。

6. 点击上传按钮，选择步骤 5 中编辑的文件，并上传该文件。

7. 点击确认按钮，确认导入主机信息。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662089708484.png)

模板可以参考如下：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662099400520.png)

- 接管集群

操作步骤

1. 进入集群管理 - 集群页面。

2. 点击接管集群按钮，进入接管集群页面。

3. 输入接管集群的基本信息：集群名称、数据库用户名 root、数据库密码。

4. 输入接管集群中控配配置信息：

○ 接管集群中控机主机 IP 地址

○ 接管集群中控机 SSH 端口号

○ 接管集群中控机 SSH 用户名

○ 接管集群中控机 SSH 密码

○ 接管集群中控机 TiUP 路径（即 .tiup 目录所在路径，不含结尾的 “/”, 例如 “/root/.tiup” ）

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662089792909.png)


- 新建集群

操作步骤

1. 登录控制台。

2. 进入集群管理 - 集群 页面。

3. 点击创建集群按钮，跳转至创建实例的页面。

4. 选择集群创建模式。

5. 选择集群主机所在厂商、区域。

6. 输入以下数据库基本信息：

○ 数据库类型

○ CPU 体系架构

○ 数据库版本

○ 参数组

7. 设置数据库产品各组件的以下配置：

○ 所在可用区

○ 实例规格

○ 实例数量

8. 输入集群的以下基本信息：

○ 集群名称 。集群名称必须是 4-64 个字符，可包含大小写字母、数字和连字符，并 以字母或数字开头。

○ 集群标签

○ 数据库管理员 Root 的密码。密码必须是 8-64 个字符，可包含大小写字母、数字 和可见的特殊字符（包括 !@#$%^&*()_+=）） 

○ 是否独占部署

9. 点击提交按钮，确认主机资源库存满足集群要求后，点击确认创建 按钮。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662089939497.png)

- 集群的扩容

操作步骤

1. 登录控制台。

2. 进入集群管理 > 集群页面。

3. 选择待删除的集群，点击集群 ID 进入集群详情页面。

4. 点击扩容按钮进入扩容页面。

5. 根据业务需要，选择要扩容引擎数量或新增不同规格的引擎数量。

6. 点击提交按钮，确认资源库存满足扩容要求后，点击确认扩容。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662089904242.png)

- 集群的缩容

操作步骤

1. 登录控制台。

2. 进入集群管理 > 集群页面。

3. 选择待删除的集群，点击集群 ID 进入集群详情页面。

4. 点击待删除实例所在行的删除按钮。

5. 点击确认按钮。

- 数据导出

操作步骤

1. 登录控制台。

2. 进入集群管理 > 导入导出页面。

3. 点击导出数据按钮，进入导出数据页面。

4. 输入源集群信息：集群 ID 、数据库用户名、数据库密码。

5. 选择导出目标位置：TiUniManager共享存储或 S3 兼容存储。

6. 设置导出选项：导出文件格式，是否筛选数据及筛选条件。

7. 记录本次导出备注信息。

8. 点击创建导出任务开始导出数据。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662090000324.png)

- 数据导入

操作步骤

1. 登录控制台。

2. 进入集群管理 > 导入导出页面。

3. 查看导入导出记录列表。

4. 选择导出记录的下载，可下载导出记录至本地。

5. 选择记录的删除，可删除导入导出记录。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662090028838.png)

## TiUniManager使用总结

1. TiUniManager帮助 DBA 对 TiDB 进行自动化、自助化和可视化管理，简化运维上的命令行上管理的繁琐步骤，实现图形化一键操作完成对 TiDB 的部署运维相关工作。

2. 导入主机可以通过集群管理-->新建集群-->导入主机，可以避免很多不必要的主机相关检测。

3. 删除集群需要注意，删除接管的集群会把集群数据也删掉的，生产上如果遇到各种原因接管任务失败，但是集群管理上还是有显示集群，这种情况下慎用删除集群这操作。

4. 新建集群只能单机单实例，没找到单机多实例的部署。

5. 导入导出功能可能需要把页面比例缩小或者更换浏览器访问，确认按钮有时候会展示原因，展示不出来。

6. 总体图形管理上还是比命令行操作运维简单了许多，在体验过程中也遇到一些bug，希望后面可以完善下，可以再增加一些新功能。