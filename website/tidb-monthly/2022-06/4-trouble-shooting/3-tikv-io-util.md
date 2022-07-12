---
title: 避坑指南：生产环境 TiKV 的 IO-Util 趋近 100% 问题定位
hide_title: true
---

# 避坑指南：生产环境 TiKV 的 IO-Util 趋近 100% 问题定位

> **[Ann_ann](https://tidb.net/u/Ann_ann/answer)** 发表于  **2022-06-17**

【TiDB 使用环境】生产环境（华为云服务器）

【TiDB 版本】v4.0.12

【遇到的问题】三个tikv的io-util趋近100%

## 问题描述

生产环境TiDB集群三个TiKV节点的磁盘IO-Util利用率很高趋近100%，云硬盘出现读写慢、IO升高、await值变大等现象：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655459748239.png)

Ps：部分业务迁移至TiDB，数据量不大几十GB

## 查找问题方向

- 扩容TiKV节点看情况是否有改善
- 压测云硬盘，更换硬盘类型
- 修改`raftstore.sync-log`=false参数观察IO情况

## 定位问题过程

### 扩容TiKV节点

在测试环境扩容两个TiKV节点，观察后续IO现象（红线后是扩容两个TiKV节点）：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655460714234.png)

发现并未改善，IO_Util还是一如既往的高

### 压测云硬盘，更换云硬盘类型

在测试环境TiDB集群扩容两台TiKV节点，其中一台保持原磁盘配置（通用性SSD），另一台使用极速SSD进行测试，目前测试环境TiKV节点服务器配置：

![1655461086041.jpg](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1655461086041-1655461135806.jpg)

#### 华为云磁盘的性能：

极速ssd iops IOPS = min (128000, 1800 + 50 × 容量) 1800 + 50 × 500=26800 所以500G的极速SSD盘iops为26800

通用ssd iops 1800 + 12 × 500=7800

极速ssd吞吐量 120 + 0.5 × 500=370M/s

通用ssd吞吐量  min (250, 100 + 0.5 × 容量) 100 + 0.5 × 500=350M/s(最大250M/s)

#### 实验结果

233节点（通用SSD）：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655461256616.png)

83节点（极速SSD）：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655461284954.png)

#### **云硬盘实验结果总结：**

单队列模式通用SSD支持最高IOPS及吞吐量： IOPS：4k左右 吞吐量：16M左右

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655461322030.png)

极速SSD支持最高IOPS及吞吐量： IOPS：3k左右 吞吐量：13M左右

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655461328281.png)

与华为云技术人员沟通，通过avgqu-sz参数得知，tidb只用到了单队列或少队里模式，导致单通道io-util接近瓶颈，而通用或极速SSD支持128队列深度，TiDB没能利用上这种模式的云盘，华为技术人员给出的建议是替换服务器实例采用本地磁盘，可能更符合TiDB的使用场景。

#### 更换云服务种类：

![1655462696751.jpg](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1655462696751-1655462748937.jpg)

#### **替换Ir3服务器（**超高I/O型弹性云服务器使用高性能NVMe SSD本地磁盘**）后测试**

##### 单队列模式压测：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655461584432.png)

超高I/O型弹性云服务器使用高性能NVMe SSD本地磁盘，提供高存储IOPS以及低读写时延，**单队列**相比测试原通用SSD提升差不多三倍，有明显的提升效果（ps:本地磁盘的服务器是100G容量，通用ssd磁盘为500G容量）

##### 将队列深度设置为4：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655461630046.png)

但队列深度调为4跟之前差不多，几乎没改善

##### 加入测试TiKV集群iostat测试：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655461704743.png)

##### 粉线为本地磁盘的ir3服务器：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655461734672.png)

#### 替换I3服务器（超高I/O型弹性云服务器使用高性能NVMe SSD本地磁盘）后测试

##### 单队列模式压测：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655461834592.png)

超高I/O型弹性云服务器使用高性能NVMe SSD本地磁盘，提供高存储IOPS以及低读写时延，单队列相比测试原通用SSD提升差不多三倍多，有明显的提升效果（ps:本地磁盘的服务器是1.6T容量，通用ssd磁盘为500G容量）

##### 将队列深度设置为4：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655461866349.png)

**队列深度调为4性能大大提升**

##### 加入测试TiKV集群iostat测试：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655461927055.png)

##### 浅绿色为I3类型服务器，浅紫色为Ir3类型服务器，均是**高性能NVMe SSD本地磁盘：**

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655461950514.png)

## 问题结论：

差不多一样的iops和吞吐量，io-util的利用率为：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655461992520.png)

官方对磁盘的要求：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655462032625.png)

**TiDB对网络及硬盘要求较高，云服务器云盘无法满足TiDB的高IO操作需要，且云盘多队列IO特性不适用于TiDB，想要使TiDB发挥出更佳性能，高性能NVMe SSD本地磁盘更符合TiDB的使用要求，建议更换超高I/O型弹性云服务器使用高性能NVMe SSD本地磁盘作为TiKV节点使用。**

#### 修改raftstore.sync-log=false参数

官方建议：sync－log 配置是控制 TiKV 数据多副本进行 raft 协议同步的时候，如果 sync－log＝false，则内存中处理完成就返回 ack，对于 3 副本来说，单节点故障是不会丢失数据的，同一个 raft 集的 2 个副本同时故障可能会出现丢数据的情况，这个问题除了金融等对数据安全性要求非常高的场景外，其他的业务场景可根据可接受程度考虑。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655462334497.png)

性能损耗：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655462399283.png)

测试后结论：效果很明显，IO-Util骤降，性能大大提升：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655462464275.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655462469983.png)

Ps：此次测试在测试环境试验，生产环境并未关闭此参数~