---
title: TiDB 生态工具 -- TiUniManager（原 TiEM）v1.0.0 体验
hide_title: true
---

# TiDB 生态工具 -- TiUniManager（原 TiEM）v1.0.0 体验

> 作者简介：一个从业10年的小小DBA，主攻MySQL，会点Python，会点前端，现在就职于G7，作为业余开发自诩为伪全栈DBA。
>
> 我的个人主页：[https://tidb.net/u/G7尹裕皓/answer](https://tidb.net/u/G7尹裕皓/answer) 目前还没啥内容，希望随着自己在 TiDB 上的成长，后续的主页越来越丰富。

## 前言

2022 年 4 月 22 日咱 P 社开启了 TiDB 6.0 的试用活动，随即我就报了名，毕竟 6.0 刚发布我就对两个管理平台产生了比较大的兴趣，包括：TiEM（即 TiUniManager）, DM WebUI 。

DM WebUI 在6.0刚发布后就体验了一把，整体使用还是很方便的，只是功能还处于实验阶段，官方也不建议上到生产环境，所以浅尝一下也就告一段落了。

TiEM 看介绍是企业版独有的功能，咱公司使用的社区版就没办法了，这次体验活动也给到了 TiEM 的体验，自然需要参与一下，也幸运的得到了体验机会。


这里解释一下为什么有两个名字：   -- 2022.6.20

TiEM 已于近日开源，改名为 [TiUniManager](https://github.com/pingcap/tiunimanager)，所以后续社区版的 TiDB 集群可以用 TiUniManager 来管理。

不过我的文章写的比较早，所以我的文章都是叫 TiEM，这个名字和 TiUniManager 等同，请读者同学们了解。

## 介绍

> 因为我这也是初次接触，这里就直接引用官方文档的介绍了

TiDB Enterprise Manager (TiEM) 是一款以 TiDB 数据库为核心的企业级数据库管理平台，帮助用户在私有部署 (on-premises) 或公有云环境中管理 TiDB 集群。

TiDB Enterprise Manager 不仅提供对 TiDB 集群的全生命周期的可视化管理，也同时一站式提供 TiDB 数据库参数管理、数据库版本升级、克隆集群、主备集群切换、数据导入导出、数据同步、数据备份恢复服务，能有效提高 TiDB 集群运维效率，降低企业运维成本。

分布式数据库管理面临集群规模化、管理场景多元化挑战，传统的命令行管理方式面临部署成本 高、技术门槛高、维护成本高等诸多挑战，TiEM 能有效解决以下场景中的分布式数据库管理难题 ：

- 主机资源管理
- 部署集群
- 统一入口管理多套集群
- 升级集群
- 参数管理
- 备份恢复
- 数据导入导出
- 安全与合规
- 自动化与第三方集成
- 管理任务历史记录可查可追溯

**注意**：TiEM v1.0.0 支持接管的TiDB集群版本为 5.x，6.0将在TiEM的后续版本兼容

## 现在开始我的体验过程

### 安装

先将官方提供的 TiEM 安装包传到我的测试服务器

> 因为我这是自己的测试服务器，外网流量只有1M，这个上传的过程就耗了我20个小时，真是漫长的等待呀

随后按照官方提供的《TiEM v1.0.0 安装手册.pdf》步骤进行安装，因为文档要求不得传播，这里就不做详细的按照流程了。

![image_z6Iv6E39K2.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_z6Iv6E39K2-1651926851156.png)

下面就贴一下我在安装过程中遇到的报错，虽然用处不是很大，但如果能帮到后面的人排错也是好的

- 安装完成后启动服务，发现遇到了第一个错误。本身的错误日志还不是很容易看出错误在哪，这是我辗转几个地方后在系统日志中看到的

![image_Wbz2FyQLv-.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_Wbz2FyQLv--1651927189193.png)

这里的解决方案是： `yum install openssl`

-  修复上面的问题后，现在又遇到了第二个问题，这次在错误日志中找到了问题

![image_XFjIIukGkb.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_XFjIIukGkb-1651927288672.png)

这里排查到是信任关系的问题，因为现在 TiEM 服务只安装在一个节点，所以只需要把自己的公钥复制到自己的 authorized_keys 中，并且做一次 ssh 跳转以完成信任关系即可

- 解决后随后再次启动，这次遇到了第三个问题，也是我的安装过程中遇到的最后一个问题

![image_bKsuGeEqTY.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_bKsuGeEqTY-1651927441652.png)

- 提示是内存至少需要4G，而我的测试机剩余内存连512M都不够，这就没办法了。照官方文档的建议在测试环境中最低配置是16G内存，但我看到提示只需要4G即可，所以只新买了一台8G内存的服务器，此刻又花出去一笔巨款😂

![image_SLw29wr1cn.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_SLw29wr1cn-1651927474374.png)

![image_qbjnIgZ-bT.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_qbjnIgZ-bT-1651927520808.png)

### 使用

解决上面一系列问题后，我终于成功启动了 TiEM 服务，现在就开始正式体验这个功能

#### 初始配置

启动后就可以登录 TiEM 管理平台了

> 默认账号:admin，默认密码:admin

![image__qBC52xMss.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image__qBC52xMss-1651928434119.png)


第一次登录有一个欢迎界面，看第一个页面应该是初始的配置引导

![image_ZVAj0Uthl8.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_ZVAj0Uthl8-1651928472494.png)


第一步看起来是配置数据中心以及各节点配置的

**特别注意**：这里的区域配置需要保证和 TiDB 集群一致，不然后续会报错。如果现有 TiDB 集群没有配置labels信息，也需要加上才行

![image_dGnV-2znr7.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_dGnV-2znr7-1651928537814.png)

![image_bIfnAlM48p.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_bIfnAlM48p-1651928604485.png)

![image_RYkdGvz3jC.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_RYkdGvz3jC-1651928640538.png)

![image_ouu3AAz-AB.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_ouu3AAz-AB-1651928676277.png)


第二步是配置各个组件的信息，页面上也只有组件名称和端口可以调整，我这里就选默认的直接下一步了

![image_DDUwJkSO5c.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_DDUwJkSO5c-1651928889733.png)


第三步是选产品版本，看起来目前还不支持6.0的管理，所以我暂时将自己的6.0回退到了5.4版本，因为可以多选我这里就选5.3以上的(TiEM v1.0.1 已经兼容了TiDB 6.0)

![image_vkDkus-689.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_vkDkus-689-1651928982554.png)


经过了引导页面我终于进到了正式页面，一眼就是 TiDB 的风格，使用 Dashboard 比较多看起来这个界面还是挺亲切的

![image_3u_6hh-36H.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_3u_6hh-36H-1651929109701.png)


#### 接管集群

我扫了一眼各个面板，可以发现第一步就是需要做上图右上角的两个按钮，选择其中一个生成第一个需要管理的集群，既然我已经有集群了（相信大多数人也是这样），我这里选择`接管集群`来开始接入我的第一个需要管理的集群。

刚进来我就遇到了第1个问题，集群名必须达到4~64个字符，而我的集群名只有3个字符。



![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655287442312.png)

![image_v0w_6Hvz4s.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_v0w_6Hvz4s-1651929197691.png)

这可怎么办呢，最快的方法就是改集群名，我这个是自己的测试机还是随便改的，下面我就开始了集群改名`tiup cluster rename yyh tidb-yyh` ，就在这时我想到如果是正在运行的生产库，并且恰好集群名小于4个字符，这种该怎么处理。我想这还需要官方给一个比较合适的方案才好。

![image_hChmCWYw7N.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_hChmCWYw7N-1651929801907.png)

现在所有选项配置好了，点击提交，看起来顺利开始接管了

![image_3H3TA2qVDy.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_3H3TA2qVDy-1651929854336.png)

![image_tlAXdM5bFa.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_tlAXdM5bFa-1651929872184.png)

谁知在这里就遇到了第2个问题，提示 `host not found 172.24.74.67` ，我开始怀疑是 TiEM 需要和 TiDB 集群中控机做互信，于是配置了互信，但还是这个结果。一筹莫展之际，于是我考虑到万能的 asktug 上去问问大佬

![image_9e22SY-qK_.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_9e22SY-qK_-1651929931450.png)

经过大佬的帮助，终于解决了问题，解决思路已经在[帖子里](https://asktug.com/t/topic/664972)了，我这里总结一下需要注意的点：

1. 一定要导入主机，可以通过主机模板修改好自己的主机信息； 
2. TiDB 集群要配置 labels 信息，并且要在 TiEM 的向导中把向导页面（如已跳过可以再点“系统管理 --> 开始向导”）中“数据中心”的各个信息配置对；
3. 在 TiEM 的中控机执行 `install -Dm755 /home/tidb/.tiup/bin/tiup /usr/local/bin`（注：这里最后的路径参考帖子的第10楼）；
4. rsa文件的复制操作一定不要漏掉

这里追加我后面遇到的第3个问题，如果接入集群的主机配置都是正确的，但是基本配置里面数据库的 root 密码输错了，会造成主机导入成功，但是集群没有的情况，这种情况也需要把主机删掉重新部署。  -- 2022.6.15 

#### 管理集群

最后我终于顺利的接管了现有集群，可喜可贺

![image_w4qO2TmI7d.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_w4qO2TmI7d-1651930212189.png)

![image_e-SFlEfo2v.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_e-SFlEfo2v-1651930223802.png)

##### 停止和重启

我先来试下一眼可见的停止和重启功能，嗯。。。很实用一键搞定

![image_utzFituLhG.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_utzFituLhG-1651930263971.png)

![image_ekpzx5UBZa.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_ekpzx5UBZa-1651930276588.png)

这里我试了一下用 TiEM 关闭，执行命令启动；以及直接执行命令关闭。这两种情况下 TiEM 都是没法检测到 TiDB 集群的最新状态的，不知道是我等的时间不够（大约等了 10 分钟）还是这里没有定时的检测机制。

![image_UmgpkBBrzo.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_UmgpkBBrzo-1651930351371.png)

我重新接管了一次集群，把 TiEM 页面显示搞正确，进入集群详情看一下。看这布局和功能，只能说不错的，啥操作都可以一键搞定。

![image_CmhLSjA6iB.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_CmhLSjA6iB-1651930452942.png)

现在简单的体验一把这里面的功能

##### 缩容

删除的节点在 TiEM 上显示是没有了，但是任务报错了，在中控机上看删除的节点也是 Down，无法再次启动。这个可能是我哪里没有配置对，也可能是 TiEM 的BUG。这里就先不管他了。

![image_RssUFgdCOi.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_RssUFgdCOi-1651930625295.png)

![image_JjpiUDlVa5.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_JjpiUDlVa5-1651930803539.png) 

我通过命令行把68节点下掉，然后加入了69节点，不过加入后 TiEM 还是没有识别到新节点的加入。我在 TiEM 做了一下重启，重启后也没有识别到新节点的加入，我感觉是设计的有问题，没有做底层变更的识别。

![image_-klWDGrKeL.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_-klWDGrKeL-1651930869590.png)

##### 扩容

扩容里能选的就是资源分配方式，自动就是系统选择可用的主机加入然后给到合适节点配置；手动是自己选择怎么加新节点，于是我新搞了个没有部署 TiDB 的服务器，结果还是没有，这里应该有充分的理由确定是 TiEM 的问题了😂

![image_BLH-OaTf3d.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_BLH-OaTf3d-1651931025633.png)

![image_dq9TaKACgO.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_dq9TaKACgO-1651931046778.png)

##### 克隆集群、数据同步

这个我现在没有多的机器来做了，就忽略了。

![image_kGsA0H1cK5.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_kGsA0H1cK5-1651931139530.png)

![image_kUvHLxgcWF.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_kUvHLxgcWF-1651931151090.png) 


##### 手动备份

点了以后就可以在备份管理中看到备份进度了，另外也可以在备份管理中设置定时备份。

最后我的任务失败了，看备份信息是备份到 TiEM 节点的共享存储，这个应该需要单独配置。

![image_l-NtJj5gAJ.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_l-NtJj5gAJ-1651931214473.png)

![image_6ksCbxvC87.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_6ksCbxvC87-1651931227342.png) 

##### 性能分析、集群监控、告警管理

这3个功能的面板都是空的没有数据，经排查是需要设置 grafana 的参数，在 [security] 下追加配置`allow_embedding = true`

我的grafana是部署在69节点，所以进入到69节点的grafana配置文件目录进行修改，编辑 `/{deploy-dir}/grafana-{port}/conf/grafana.ini` 文件，按如下所示修改配置项：

```ini
[security]
allow_embedding = true
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655294460824.png)

> 不过如提示调整了参数最终也看不到，现在只能怀疑是服务器之间的网络问题，因为我的测试机网络带宽很小，可能不足以支持监控数据的传输。

目前还不清楚解决办法，还是放几张界面截图吧，虽然没有内容。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655297437983.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655297315590.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655297552494.png)

##### 日志管理

可以看到各组件的日志，挺实用

![image_FSe-ZTZTQc.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_FSe-ZTZTQc-1651931443530.png)

##### 升级

因为我之前装的是 5.4，现在 TiEM 最高只支持 5.4，所以我重装一个 5.3 再来操作。

我的重装是命令行重装的，TiEM 上面也识别不到集群已经没有了，点删除报了个错然后集群状态变成了异常，只能先不管了。但是新接管的集群还是报错了，旧集群相关的主机也没法删除。

![image_qfQ8kgKDEo.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_qfQ8kgKDEo-1651931502986.png)

无奈呀，我还是重装一下 TiEM 吧。当我打开 TiEM 中控机的时候，聪明的我想到重启一下不就好了吗，毕竟重启可以解决99%的问题。结果可想而知，我还是老实的重装了 TiEM。

![image_9A8kQumK48.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_9A8kQumK48-1651931544921.png)

 现在我点开了升级，结果仍然没有办法操作，我想这个功能应该还没有做好吧

![image_kpSqjgbWJS.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_kpSqjgbWJS-1651931593476.png)

##### 删除集群

现在把我刚重建的集群删掉，这次直接操作还是很顺利的。值得注意的是删除集群不会把主机删掉，这样下次接管是不是就不用再导入主机信息了。

![image_yQv6g3IK0C.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_yQv6g3IK0C-1651931655629.png)

![image_x_BQAox-7x.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_x_BQAox-7x-1651931664987.png)

![image_ZcE3rhyn8s.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_ZcE3rhyn8s-1651931673482.png)

但是我到中控机上查看，集群并没有真正的被删除，只是状态变成了 Down，命令行操作没有再次启动以及其他操作。这可能是防止误操作做的保护措施，保留一下原始信息？

![image_7czBZC2PqI.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_7czBZC2PqI-1651931707888.png)

![image_HBE0stXJME.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_HBE0stXJME-1651931721992.png)

```markdown
最后是通过强制参数卸载了集群：tiup cluster destroy tidb-yyh2 --force
```

#### 创建集群

从按钮来看目前只能选择轻松创建的选项。

![image_CmwEC1tD-u.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_CmwEC1tD-u-1651932028063.png)

资源分配中手动分配需要提前导入主机，我先尝试自动分配。

![image_-Sww9COqss.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_-Sww9COqss-1651932052238.png)

填写好集群信息，因为我是混布的测试机，我把独占部署去掉了。

![image_F6RTpCoKxh.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_F6RTpCoKxh-1651932067955.png)

点提交后提示库存不足，没有选独占部署也无法识别到需要的机器，这对混部确实不友好呀。

![image_8d0fXB1ErL.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_8d0fXB1ErL-1651932079426.png)

选手动部署是什么效果呢。。。。变成了啥都不能选。

![image_jWyboKy0qj.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_jWyboKy0qj-1651932096491.png)

#### 导入导出

先来看下导出吧，毕竟只有一个集群。看起来导出也只能导到共享存储上面。

![image_osOQGPmUfk.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_osOQGPmUfk-1651932108189.png)

第一次报错了，报错信息是我没有装 dumpling，于是我把 dumpling 装上再试一次。

![image_XedFPGdwB6.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image_XedFPGdwB6-1651932124073.png)

结果还是一样的报错，我分别用了tiup安装和直接下载安装包，两种方法都没有效果。因为时间关系我就暂时不体验了，应该就是 dumpling 和 lightling 的功能做了包装，这个能可视化的操作还是很爽的。

### 系统管理功能 

最后我看了下系统管理中的 系统监控、系统日志、系统追踪。这三个功能也监控不到信息，最开始也是怀疑 grafana 参数的问题，但是我调整了 TiEM 集群的 grafana 参数也没有作用。最终也只能怀疑到是带宽不够，因为最近太忙时间不够的原因，所以暂时没法找解决办法，等后面空了再看。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655297808977.png)

## 最后做个总结：

目前来说 TiEM 部署起来还是比较简单的，但也有些小问题。

使用方面：界面还是很清爽，各个功能一眼可见，也基本包含了我们日常运维的所有功能。只是呢，很多功能都还有问题，用的不太顺心。

当然，毕竟这还只是第一版，也还没有正式推广，有瑕疵很正常。

最后的最后，其实我对 TiEM 还是挺期待的，这些功能全部都完善以后，如果能用在日常工作中，那绝对是解放双手的利器。
