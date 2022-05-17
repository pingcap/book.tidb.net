---
title: TiDB 6.0 Book Rush 文章构思指南
hide_title: true
---

# TiDB 6.0 Book Rush 文章构思指南

如果你已经下载并开始试用 TiDB 6.0，但对于文章如何去写感到无从下手，这篇文章应该能帮到你找到一些思路；如果你已经有了一些思路，这篇文章也可以帮助你去梳理和完善思路，写出更好的文章。最后，我们也提供了一些提升技术写作能力的教程，趁着这个机会，快来再学一门技艺傍身吧！

## 选择主题 & 参考大纲

写文章的第一步是选择主题，TiDB 6.0 中一口气发布了 [14 个重磅的特性](https://docs.pingcap.com/zh/tidb/v6.0/release-6.0.0-dmr#tidb-600-release-notes)，你可以选择自己感兴趣或者未来工作中可能会用到的特性重点展开测试，主题的选择上可以从以下 4 个角度去构思。这里也为每一个主题提供了参考的大纲结构，当然针对不同主题，需要在大纲结构上进行细分，不同部分有所侧重。

### TiDB 6.0 的原理和特性解读

这一类文章会从某一个特性出发，深入解读这个特性背后的设计和实现原理。

#### **大纲结构参考**

1. 背景 or 前言
   1. 这个特性的简单介绍，在 6.0 中的价值或意义；
   2. 为什么想要深入研究这个特性；
2. 架构设计解读
   1. 这一部分介绍这个特性整体的架构设计；
3. 分模块解读
   1. 这一部分需要深入特性各个模块的代码，分析每个模块的实现原理；
4. 总结
   1. 从原理的角度分析这个特性适用于哪些业务场景，对 TiDB 产品的意义；
   2. 有哪些建议改进的地方；

#### **优秀文章参考**

* [TiDB 6.0 新特性解读 | Collation 规则](https://tidb.net/blog/82d7530c)
* [一篇文章说透缓存表](https://tidb.net/blog/f663f0f5)
* [TiFlash 源码阅读（一） TiFlash 存储层概览](https://mp.weixin.qq.com/s/ZroBlbtJoCSfGTnPdLmY9g)

### TiDB 6.0 特性实践类

这一类文章会从试用和体验的角度，去深入解读某一个特性，通常会对这个特性的应用场景做全面的分析和总结。

#### 大纲结构参考

1. 背景 or 前言
   1. 这个特性的简单介绍，在 6.0 中的价值或意义；
   2. 为什么想要深入研究这个特性；
2. 部署架构 & 硬件环境
   1. 简单介绍下你测试的硬件环境和整体的部署架构，让读者了解的你硬件和软件资源情况；
3. 功能体验
   1. 对于功能类的特性，这一部分要重点展开。请深入体验特性中的每一个功能，并做详细的介绍；
4. 性能测试 & 分析
   1. 对于性能提升类的特性，这一部分要重点展开；
5. 遇到的问题（可选）
   1. 试用过程中遇到的问题，以及是如何解决的；
6. 总结
   1. 从试用情况来看，这个特性适用于哪些业务场景；
   2. 未来是否有计划应用在生产环境中，如何应用；
   3. 希望这个特性未来进一步提升的方向；

#### 优秀文章参考

* [TiDB v6.0.0(DMR) 缓存表初试](https://tidb.net/blog/452fe625)
* [TiDB 6.0 Placement Rules In SQL 使用实践](https://tidb.net/blog/5e59b4f8)
* [5.0 新特性试用体验之 Clustered Index](https://tidb.net/blog/69dd056c)

### 版本测评类

这一类文章可以从新旧版本特性对比，新旧版本性能对比，版本升级对比等方向进行构思。

测试具体操作可参考：

* [如何用 Sysbench 测试 TiDB](https://docs.pingcap.com/zh/tidb/dev/benchmark-tidb-using-sysbench#%E5%A6%82%E4%BD%95%E7%94%A8-sysbench-%E6%B5%8B%E8%AF%95-tidb)
* [专栏 - TiDB 性能测试最佳实践 | TiDB 社区](https://tidb.net/blog/b8dccf46)
* [TiDB Sysbench 性能对比测试报告 - v6.0.0 对比 v5.4.0](https://docs.pingcap.com/zh/tidb/dev/benchmark-sysbench-v6.0.0-vs-v5.4.0)

#### 大纲结构参考

1. 背景 or 前言
   1. 做这次测评的目的；
   2. 如果是版本测评，写清楚对比了那个版本；
   3. 如果是选型测评，写清楚对比了哪个数据库的哪个版本；
   4. 重点测试了 TiDB 6.0 的哪些特性；
2. 部署架构 & 硬件环境
   1. 硬件环境和架构对于特性表现有重要影响，在测评文章中必不可少；
3. 测试场景说明
4. 测试详细操作
5. 数据情况对比
6. 总结

#### 优秀文章参考

* [专栏 - TiFlash 5.x 与 4.x 对比测试 | TiDB 社区](https://tidb.net/blog/b3740d1c)
* [专栏 - TPC-H 下 TiFlash 的扩展性测试报告 - v5.1.0 | TiDB 社区](https://tidb.net/blog/8d93cf4e)
* [专栏 - 数据库架构升级选型 - TiDB | TiDB 社区](https://tidb.net/blog/91d0b4ee)
* [专栏 - 国产主流数据库调研 | TiDB 社区](https://tidb.net/blog/4a70bb91)
* [专栏 - Oceanbase和TiDB粗浅对比之 - 执行计划 | TiDB 社区](https://tidb.net/blog/f1fd1733)

### TiDB 6.0 最佳实践类

#### 大纲结构参考

1. 公司简介以及使用 TiDB 相关的业务场景介绍
   1. 目前遇到的业务挑战
   2. 为什么要使用 TiDB
   3. 在 TiDB 与其他数据库对比选型时候的思考
2. TiDB 6.0 应用场景 1
   1. 业务场景描述
   2. 技术架构描述
   3. 业务收益
3. TiDB 6.0 应用场景 2……
4. 总结
   1. 从目前场景的试用结果看，TiDB 在哪些场景具有优势，归纳 TiDB 在该场景的最佳实践，为其他同行提供经验参考
   2. 未来展位 & 希望 TiDB 进一步提升的方向

#### 优秀文章参考

[TiDB 在马上消费金融核心账务系统归档及跑批业务下的实践](https://asktug.com/t/topic/2686)

### 总结部分应该如何写？

目前 TiDB 6.0 Book Rush 活动已经收到了十几篇投稿文章，我们在 review 的过程中也发现，大家在撰写文章最后的总结部分时，会有点困难，所以这里也单独把这一部分拿出来给大家一些方向上的建议。

1. 呼应前面背景部分，有没有解决之前要体验这个特性的原因；
2. 基于前面的体验或测试，总结一下试用之后的整体感受，比如分析和之前相比会提供哪些便利，或有哪些功能性或性能上的提升；
3. 体验的过程中遇到了哪些问题，有哪些改进的建议；
4. 未来的计划，比如是否计划将其应用在某个业务场景上等。

## 选题后该如何开始动手写“优质”技术文章？

### 文章结构或提纲

确定文章结构，指整篇文章叙述的结构或者提纲，通常包含开头、正文、结尾，有了提纲再去写作会更有方向性，更高效。这里可以参考前面的文章大纲参考。

### 完善内容

指根据叙述结构后提纲，去完善文章的主体部分，每一部分相对独立的内容建议一口气写完。这一步可以 **快速完成，多次迭代** 。和写代码一样，每次集中精力，60~120分钟写一个部分，中间不被打断，这样的“时间块”的产出最高，也更容易挤出来。

开头和结尾这种重要的部分如果一开始没有灵感，可以先放放，让更精彩的文字来找你。

### 自我审校

* **结构是否清晰、完整** ：结构严谨、逻辑清晰、始终围绕主题、前有背景交代、后有总结，结构的完整、清晰大大加分

* **内容可读性** ：行文流畅，有过渡有衔接，无明显技术错误

* **语言流畅与否** ：用书面化的语言去表达，避免过于口语化

* **错别字检查**

* **安全脱敏：** 内容脱敏、公关上利好、不会引起争议

### 文章发布

接下来，你需要把内容发布在社区的网站上，这时候要注意排版的问题：
* 比如多级标题的展示清晰，重点内容加粗，代码高亮等
* 专栏采用了 Markdown 编辑器，可以参考 [Markdown 语法教程 ](https://markdown.com.cn/intro.html)去优化

### 入选电子书，提交 PR

接下来，如果你的文章通过 Book Rush Reviewer 小组的审核，最终入选了电子书，请按照以下的指引去提交 pr，你的文章就可以在电子书的页面展示啦！

- PR 贡献指南：[TiDB 6.0 Book Rush 贡献指南](3-contribute-guide.md)


## TiDB 6.0 Book Rush 已投稿文章
对于 TiDB v6.0 还在观望状态的大佬们，可以看下一下的 6.0 试用的专栏文章~
- [TiDB 6.0 新特性解读 | Collation 规则](https://tidb.net/blog/82d7530c)
- [TiDB 6.0 Placement Rules in SQL 使用实践](https://tidb.net/blog/5e59b4f8)
- [TiDB v6.0.0(DMR)缓存表初试](https://tidb.net/blog/452fe625)
- [体验TiSpark 基于TiDB v6.0 (DMR)的最小实践](https://tidb.net/blog/02918c68)
- [体验TiDB V6.0.0 之Clinic](https://tidb.net/blog/audits/6b2cf9a8)
- [体验TiDB v6.0.0 之TiCDC](https://tidb.net/blog/54af3eb4)
- [体验TiDB V6.0.0 之TiDB的数据迁移工具DM-WebUI](https://tidb.net/blog/87a38392) 
- [一篇文章说透缓存表](https://tidb.net/blog/f663f0f5)
- [TiEM初级实践](https://tidb.net/blog/a51f9e05)
- [TiEM初体验](https://tidb.net/blog/925a7ffe)
- [TiDB 6.0 新特性解读 | 离线包变更](https://tidb.net/blog/3a05d13c)
- [TiDB V6.0.0体验 -- TiEM](https://tidb.net/blog/e326d4bd)
- [TiDB 6.0 新特性解读 | TiFlash 新增算子和函数下推](https://tidb.net/blog/2188d936)
- [TiDB冷热存储分离解决方案](https://tidb.net/blog/387bd516)

## 附：技术写作能力提升资料

对于开发人员来说，技术写作已经成为一项非常加分的能力，不管是 build 自己的技术品牌还是找工作都非常有帮助。这里也为大家提供了一些学习资料，帮助大家提高技术写作能力。

* [InfoQ编辑如何写技术文章：敏捷写作 ](https://mp.weixin.qq.com/s/mfSMKebDnKigJPZXEexNqg)by InfoQ
* [《技术写作手册》](https://mp.weixin.qq.com/s/rxWFSSZYOxJ8UDJ6ujn3tw)by ThoughtWoks
* [视频：技术写作的那些事](https://scrmtech.gensee.com/webcast/site/vod/play-bf35db5f1b3b47ac92a164e390994179) by ThoughtWoks
* [Technical Writing Course by Google](https://developers.google.com/tech-writing) by Google
* [快速掌握完整的技术写作流程](http://mp.weixin.qq.com/s?__biz=MzI4MTg3OTkwNg==&mid=2247484019&idx=1&sn=a036ca3cd7150cbbc1bbaa144668280c&chksm=eba3367edcd4bf68507cc48bbb5d9617d074e749d3140b91b787895584d7b821547dca92452c&scene=21#wechat_redirect) by Lilian Lee from PingCAP
* [技术写作实例解析 | 简洁即是美](http://mp.weixin.qq.com/s?__biz=MzI4MTg3OTkwNg==&mid=2247483705&idx=1&sn=4e9e4f33909e82aac0b0745301ac7b29&chksm=eba33534dcd4bc22baad2b705508faf3f6130607d104998142a81680782b46b0a0b21ad77945&scene=21#wechat_redirect) by Lilian Lee from PingCAP
* [如何写好技术性文章？](https://www.zhihu.com/question/61510945) from 知乎