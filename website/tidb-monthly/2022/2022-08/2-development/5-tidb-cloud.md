---
title: 使用 TiDB Cloud (DevTier) 构建 TiDB 集群 - TiDB 社区技术月刊
sidebar_label: 使用 TiDB Cloud (DevTier) 构建 TiDB 集群
hide_title: true
description: 本文将介绍以最快的方式开始使用 TiDB。你将使用 TiDB Cloud 创建并启动一个免费的 TiDB 集群，使用 TiDB SQL 客户端，插入数据。随后将从示例程序读取出数据。
keywords: [TiDB Cloud, 集群, 应用程序, 云原生 ,DevTier]
---

# 使用 TiDB Cloud (DevTier) 构建 TiDB 集群

> 作者：王琦智

本章节将介绍以最快的方式开始使用 TiDB。你将使用 [TiDB Cloud](https://en.pingcap.com/tidb-cloud) 创建并启动一个免费的 TiDB 集群，使用 TiDB SQL 客户端，插入数据。随后将从示例程序读取出数据。

若你需要在本地计算机上启动 TiDB，请参阅[本地启动 TiDB](https://docs.pingcap.com/zh/tidb/stable/quick-start-with-tidb)。


## 第 1 步：创建免费集群

1. 如果你还未拥有 TiDB Cloud 帐号，请先在此[注册](https://tidbcloud.com/free-trial)。
2. 使用你的 TiDB Cloud 帐号[登录](https://tidbcloud.com/)。
3. 在[方案](https://tidbcloud.com/console/plans)内选择一年内免费的 Developer Tier 方案，或直接点击[创建 Dev Tier 集群](https://tidbcloud.com/console/create-cluster?tier=dev)，进入 **Create a Cluster (Dev Tier)** 页面。
4. 请在 **Create a Cluster (Dev Tier)** 页面填写集群名称/密码/云服务商（暂时仅可选择 AWS）/ 可用区（建议就近选择）后，点击 **Create** 按钮创建集群。
5. 稍作等待，在 5~15 分钟后，将创建完毕，可在 [Active Clusters](https://tidbcloud.com/console/clusters) 查看创建进度。
6. 创建完毕后，在 **Active Clusters** 页面，点击集群名称，进入该集群控制面板。 ![active clusters](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1660118928035.png)
7. 点击 **Connect**，创建流量过滤器（允许连接的客户端 IP 列表）。 ![connect](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1660118928035.png)
8. 在弹出框内点击 **Add Your Current IP Address**，此项将由 TiDB Cloud 解析你当前的网络 IP 填入。点击 **Create Filter**，进行流量过滤器的创建。
9. 复制弹出框 **Step 2: Connect with a SQL client** 中的连接字符串，供后续步骤使用。

![SQL string](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1660118928531.png)

## 第 2 步：连接到集群

1. 若未安装 MySQL 客户端，请选择自己的操作系统，按以下步骤安装。

   - macOS
   - Linux

如果你没有安装 Homebrew，请移步 [Homebrew 官网](https://brew.sh/index_zh-cn)进行安装。

   ```
   brew install mysql-client
   ```

   在安装完成的命令行输出中，得到以下信息：

   ```
   mysql-client is keg-only, which means it was not symlinked into /opt/homebrew,
   because it conflicts with mysql (which contains client libraries).
   
   If you need to have mysql-client first in your PATH, run:
   echo 'export PATH="/opt/homebrew/opt/mysql-client/bin:$PATH"' >> ~/.zshrc
   
   For compilers to find mysql-client you may need to set:
   export LDFLAGS="-L/opt/homebrew/opt/mysql-client/lib"
   export CPPFLAGS="-I/opt/homebrew/opt/mysql-client/include"
   ```

   请运行其中的此行（命令行输出若与此处文档不一致，请以命令行输出为准）：

   ```
   echo 'export PATH="/opt/homebrew/opt/mysql-client/bin:$PATH"' >> ~/.zshrc
   ```

   完成后，生效该配置文件（例如 `~/.zshrc`），并验证 MySQL 客户端是否安装成功：

   ```
   source ~/.zshrc
   mysql --version
   ```

   预期会得到形如以下的输出：

   ```
   mysql  Ver 8.0.28 for macos12.0 on arm64 (Homebrew)
   ```

2. 运行第 1 步中得到的连接字符串。

   ```
   mysql --connect-timeout 15 -u root -h <host> -P 4000 -p
   ```

3. 填写密码，完成登录。

## 第 3 步：运行示例应用程序

1. 克隆 tidb-example-java 项目。

   ```
   git clone https://github.com/pingcap-inc/tidb-example-java.git
   ```

2. 更改连接参数。

   - 本地默认集群
   - 非本地默认集群、TiDB Cloud 或其他远程集群

3. 无需更改。

4. 运行 `make plain-java-jdbc`。

5. 输出应如[预期](https://github.com/pingcap-inc/tidb-example-java/blob/main/Expected-Output.md#plain-java-jdbc)所示