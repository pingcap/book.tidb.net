---
title: 我和 TiDB 的故事 | 缘份在，那就终是能相遇的 - TiDB 社区技术月刊
sidebar_label: 我和 TiDB 的故事 | 缘份在，那就终是能相遇的
hide_title: true
description: 本文分享了社区用户学习 TiDB 半年一些有趣的故事。
keywords: [TiDB,TiDB 社区故事, 社区, 用户]
---

# 我和 TiDB 的故事 | 缘份在，那就终是能相遇的

> 作者：G7尹裕皓

原创[社区活动](https://tidb.net/blog/tag/community-activity)[人物访谈](https://tidb.net/blog/tag/interview)

## 初次听说

还记得那是2019年上半年的某一天，坐在旁边的师父转过来给我说：“裕皓，你有没有听过 NewSQL”，于是就有了如下一段对话：

。。。

师父：裕皓，你有没有听过 NewSQL？

我：NewSQL 是什么？

师父：NewSQL 就是集合了关系型数据库和NoSQL数据库的优势，既能满足弹性扩展、高可用、分布式，还能像关系型数据库一样支持事务，用SQL查询数据。

我：哦，这么厉害。

师父：是的，现在有数据库叫 TiDB，就是这样一个 NewSQL 的数据库，你可以去了解一下。

我：嗯嗯，好的，我去看下。

。。。

于是我第一次听说了 TiDB 这么一个产品。

随后我找到了 TiDB 的官网（https://pingcap.com/zh/），并初步了解了 TiDB 的原理和架构。

不过当我看到测试机需要的配置后便结束了继续深入，因为即便测试机的配置要求都很高，咱当时穷呀，公司不提供测试机，自己也买不起服务器，只好作罢，不过这也成了我现在深入 TiDB 的契机。

> 文中提到的我的师父叫 张炜，可能成都的小伙伴们知道这个名号，因为我已经在不下3个技术交流群被问到：你们神马有个数据库大神，叫张炜，他现在还在神马没？
> 其实他是我在神马工作期间的领导，当时我还是一个从 Oracle 转到 MySQL 不到一年的小小 DBA，工作期间他教了我很多 MySQL 运维管理的知识和方法，所以是我的师父没错啦，当然我平常都是随大家叫炜哥

## 再次接触

再次接触 TiDB 已经是2年后的2021年10月，这时距离我跳槽到G7也已经快1年的时间了。因为需要技术互备的原因，这次终于是正式进入了 TiDB 的世界。

### 怎么快速入门呢

官方文档是个很好的选择，不过我不太喜欢看纯文档，于是开始在各个网站找系统的视频教程，最终锁定了2个看起来比较靠谱的教程，记得费用大概在800多，不过想想还是太贵了，想着再找找看，实在不行那再买吧。最后抱着试试的心态进入了 TiDB 官网看课程有没有更新。

> 之前的官网也有课程，但是不成体系，每节都是负责对应业务的技术大佬来讲的，怎么说呢，大佬技术很牛逼，但多数大佬讲课真的不太行😂

然后我惊奇的发现，官网已经更新了系统的课程（https://learn.pingcap.com/learner/course），还是免费的，那免费的肯定是香呀，所以先看呗，不行再说。于是，我开启了在官网白嫖知识的日子，因为官网的新课程不仅免费，而且质量不是一般的高。

### 白嫖真的香

我感觉自己开始学习 TiDB 的时间真的很巧，刚想找课程，发现官网有了。免费课程学着，突然宣布 PTCA\PCTP 认证限时免费报名了，甚至一时间我都觉得自己是天选之子。

#### 101

说学就开始，从10月底，准确的说是2021.10.21，这是我注册的日期，随后开始了101的学习，内容还是简单，很快就掌握了，课程对应的考试也做了五六次，最终达到能够满分才满意的结束了101的学习。

#### 301

随后开始了301的学习，内容也不算太难，学习完第一篇以后发现可以报名这门课对应的 PTCA 认证，不过最近几次都报满了，那想着正好吧，我再刷一遍课程。就这样，我开始301的二刷，又刚好赶上双十一，所以“斥巨资”买了3台服务器来做测试机，期间也时不时看下新的考试场次出来了没。

最终在11月底的样子，有天晚上想看下有没有新开考试场次，结果刷出了最近的一场考试有名额放出（应该是有人退了本次考试），所以立马报名，随即开始了301课程的二刷、三刷、四刷。最终在多次刷课程以及练习后，成功获取到了 PCTA 的认证。

![1.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1-1658828952451.png)

![2.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/2-1658828958386.png)

#### 302

拿到 PTCA 认证后，就暂时没有新的课程可以看了

悠闲的日子没有持续多久，就在元旦假期的前两天（2021.12.30），官方突然宣布免费开放302课程，并且2周内看完课程的可以获得认证机会1次

![3.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/3-1658828970309.png)

又一次的白嫖机会，这哪能错过呢，不仅可以学到新知识，还能获得官方的认证，果断加入学习计划。甚至于在第二天的时候，我觉得这次机会难得，不能被外物影响，于是果断卸载了所有游戏，卸载了抖音，专心学习课程。最终在这样的学习进度下，我在第六天完成了课程目标。

拿到考试资格后终于不用这么着急的学习了，于是稍微放慢了进度。最后在四刷课程的时候，迎来了 PTCP 的考试，当然，最终的结果也没有辜负将近一个月的学习时间。

![4.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/4-1658828982849.png)

![5.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/5-1658828987203.png)

## 融入社区

PCTP 认证完以后那就是真的有点闲下来了，工作之余就逛逛社区，看看有没有什么新活动；看看有没有什么问题是我可以回答的，不过咱社区的版主们真是太卷了，大部分问题根本插不上嘴。

期间参加了304、305课程的内测活动，又一次知识的学习，因为这次活动也成了版主获选人。

到4月份又参加了6.0的试用活动，刚好工作上开始忙了，就只体验了一个自己比较感兴趣的功能。

也是这期间，有幸成为了6.0试用活动的 Reviewer，自己没时间写文章，看看别人的文章还是好的。

![6.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/6-1658828999323.png)

## 我需要进阶

最近又到了比较闲的时候，想到之前生产环境出现性能问题，我能够大概定位到问题出在哪，但又没法精准的评估具体的，当时就感觉自己的技术还是差了一点，一定要找个机会再精进一下。

所以想着趁这段时间空闲了，咱继续学习吧，正好攒够了兑换课程的积分，说干就干，我要开始我的进阶之旅了。

![7.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/7-1658829010085.png)

那这次写作就到此为止吧，希望下次写文章的时候，我已经是 TiDB 专家了😎。