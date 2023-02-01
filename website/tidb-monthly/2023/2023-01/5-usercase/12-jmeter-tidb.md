---
title: 通过 Jmeter 对 TiDB 数据库进行压测 - TiDB 社区技术月刊
sidebar_label: 通过 Jmeter 对 TiDB 数据库进行压测
hide_title: true
description: 
keywords: [TiDB, Jmeter, 压测, 存储服务]
---

# 通过 Jmeter 对 TiDB 数据库进行压测

> 作者：[lqbyz](https://tidb.net/u/lqbyz/answer)

JMeter也称为“Apache JMeter”，它是一个开源的，100%基于Java的应用程序，带有图形界面。 它最初设计用于测试Web应用程序，但后来扩展到了其他测试领域。

Jmeter可以用于测试静态和动态资源，例如静态文件、Java 小服务程序、CGI 脚本、Java 对象、数据库、FTP 服务器， 等等。JMeter 可以用于对服务器、网络或对象模拟巨大的负载，来自不同压力类别下测试它们的强度和分析整体性能。另外，JMeter能够对应用程序做功能/回归测试，通过创建带有断言的脚本来验证你的程序返回了你期望的结果。为了最大限度的灵活性，JMeter允许使用正则表达式创建断言。

通过Jmeter可以对TiDB数据库进行压测，从而找出数据库的瓶颈对相关的系统参数进行优化，提供数据库的性能，如下就是对TiDB数据库进行压测的实例

## 1.下载数据库驱动（mysql-connector-java-X.xx.jar）放到Jmeter的lib路径下

### 1.1、登陆MySQL官网[https://dev.mysql.com/downloads/ ](https://dev.mysql.com/downloads/，点击Connector/J)

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675132197096.png)

### 1.2、选择下载页面进行下载

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675132197111.png)

### 1.3、把下载的jar包文件放到apache-jmeter-5.4.3/lib下

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675132196623.png)

## 2.使用jmeter连接数据库

### 2.1、创建测试计划，并在测试计划中将数据库驱动添加到class path

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675132196630.png)

### 2.2、创建线程组，并在线程组下添加配置元件JDBC ConnectionConfiguration

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675132197149.png)

### 2.3、配置JDBC Connection Configuration元件参数

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675132196632.png)

```
VariableName：数据库连接池的名称，我们可以有多个jdbc connection configuration，每个可以起个不同的名称，在jdbc request中可以通过这个名称选择合适的连接池进行使用。

Max Numberof Connection：数据库最大链接数

MaxWait（ms）：最大等待时间

timebetween eviction runs：运行时间间隔

Auto Commit：自动提交。有三个选项，true、false、编辑（自己通过jmeter提供的函数设置）



TransactionIsolation：事务间隔级别设置，主要有如下几个选项：（对JMX加解密）

TRANSACTION_NODE：事务节点

TRANSACTION_READ_UNCOMMITTED：事务未提交读

TRANSACTION_READ_COMMITTED：事务已提交读

TRANSACTION_SERIALIZABLE：事务序列化

DEFAULT：默认

TRANSACTION_REPEATABLE_READ：事务重复读



Connection Validationby Pool

Test WhileIdle ：当空闲的时候测试连接是否断开

Soft MinEvictable Idle Time(ms) ：最少的时间连接可能在池中闲置，然后才有资格被闲置的对象驱逐出去，额外的条件是至少在池中保持连接。默认值为5000(5秒)

validationQuery：配置数据库时，属性validationQuery默认值为“select 1”，对于oracle值应为“select 1 from dual”。用来验证数据库连接的语句，这个语句至少是返回一条数据的查询语句。每种数据库都有自己的验证语句。大部分数据库都是select 1。



DatabaseConnection Configuration（这里的配置最重要，决定你可不可以连上数据库）

DatabaseURL: jdbc:mysql://服务器地址:3306/数据库名

JDBC Driverclass:数据库JDBC驱动类名：com.mysql.jdbc.Driver

Username:数据库连接用户名

password:数据库连接密码
```

### 2.4、在线程组下添加JDBC Request取样器，连续添加两次一个用于查，一个用于写入。

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675132197112.png)

### 2.5、配置JDBC Request取样器，一个用于读，另一个用于写。

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675132196627.png)

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675132197138.png)

```
VariableName：选择之前在JDBC Connection Configuration元件中配置好的，这个变量决定这request请求发送命令到那个连接的数据库。

Query Type:要进行的操作类型

 a)  Select statement：查询语句类型

 b)  Update statement：更新语句类型

 c)  Callable statement：可调用语句类型

 d)  Prepared select statement：statement用于为一条SQL语句生成执行计划，如果只执行一次SQL语句，statement是最好的类型，Prepared statement用于绑定变量重用执行计划，对于多次执行的SQL语句，Prepared statement是最好的类型。

 e)  Prepared update statement：用法与Preparedselect statement相似。

 f)  Commit：将未存储的SQL语句结果写入数据库表。

 g)  Rollback：撤销指定SQL语句的过程。

h)  AutoCommit(false)：将用户操作一直处于某个事务中，直到执行一条commit提交或rollback语句才会结束当前事务重新开始一个新的事务i)  AutoCommit(true)：无论何种情况，都自动提交将结果写入，结束当前事务开始下一个事务Query ：要进行的操作
```

### 2.6、添加聚合报告

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675132196630.png)

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675132197111.png)

### 2.7、保存，步骤：文件-->保存测试计划为

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675132196632.png)

### 2.8、运行脚本，运行--启动

## 3.查看实验结果

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675132197112.png)

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675132196603.png)
