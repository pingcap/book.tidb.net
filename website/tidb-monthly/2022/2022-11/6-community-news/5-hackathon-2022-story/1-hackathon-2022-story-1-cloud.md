---
title: 让迁移不再开盲盒，让云也能省钱|Hackathon 项目背后的故事第一期回顾 - TiDB 社区技术月刊
hide_title: true
sidebar_label: 让迁移不再开盲盒，让云也能省钱|Hackathon 项目背后的故事第一期回顾
description: 本期迎来的是 Hackathon 应用组项目，主题为“大话 Cloud 成本 & 易用性”。PingCAP 全球社区生态负责人姚维与评委联易融副总裁沈旸、“不上班你养我啊”、“敲代码不喊我是吧”两支赛队队长连线，从企业云上成本优化、TiDB 易用性等角度，进行在线圆桌讨论，解读项目背后的故事及其体现出的应用价值。
keywords: [TiDB, Hackathon, cloud, summary, 成本, 易用性]
---

# 让迁移不再开盲盒，让云也能省钱丨Hackathon 项目背后的故事第一期回顾

TiDB Hackathon 2022 已经完美收官，经过两天一夜的 Hacking Time ，共有 16 支队伍获奖，在内核优化、工具、应用、区块链等方向诞生出许多优秀项目。我们在赛后策划了一系列「 TiDB Hackathon 2022 非正式会谈」 —— Hackathon 项目背后的故事 ，邀请大赛评委老师与优秀项目团队一起共话 Hackathon 那些脑洞大开的项目创意。

第一期迎来的是 Hackathon 应用组项目，主题为“大话 Cloud 成本 & 易用性”。PingCAP 全球社区生态负责人姚维与评委联易融副总裁沈旸、“不上班你养我啊”、“敲代码不喊我是吧”两支赛队队长连线，从企业云上成本优化、TiDB 易用性等角度，进行在线圆桌讨论，解读项目背后的故事及其体现出的应用价值。

## “省钱”的项目——云迹

“不上班你养我啊”这个队名让很多人一看到就瞬间想起了喜剧之王，这个团队的所有小伙伴也希望秉承着“快乐比赛”的理念参与 Hackathon ，甚至连参赛口号都是与之相对应的“省点钱养你”。将他们的队名与口号连接起来，你就能看出“云迹”（项目链接： [https://github.com/VelocityLight/yunji ](https://github.com/VelocityLight/yunji)）这个项目的设计初衷。按照队长叶鋆郴的话说，这是一个能直接以“金钱”来衡量价值的项目，他们希望通过搭建一个能够分析云资源成本和使用痕迹的平台，帮助企业省钱。

![云迹.png](https://img1.www.pingcap.com/prod/_90f40dfa41.png)

在创意脑暴时，叶鋆郴和队员们提出了各种 idea，有数据洞察、有直播领域的实时性热点，还有在股市方面的分析预测等，最后大家一致认为成本优化是一个更贴近实际应用场景的应用。这个方向让曾经担任过 CIO 的评委沈旸深有感触。上云之后，云资源的账单永远是一件让 CIO 很头痛的事情。当看到“不上班你养我啊”团队在 Hackathon 答辩 DEMO 中的资源和账单飙升时，他笑言“如果换成以前，血压就直接上来了。”

沈旸介绍，企业上云虽然能在初期降低入门难度，但实际上在一个公司里，生产系统只占一小部分，大部分系统其实都是给开发测试或者 POC 使用的。而这些系统的运行大部分对 CPU 的占用是比较低的，如果使用率和效率不提升，就会给公司带来大量的资源浪费。举例说，如果一个人工智能训练里调用了 GPU 资源，在训练结束后忘记关了，那这个账单就会像水一样来到你的面前。很多人都会把云计算比喻为自来水一样便利，但如果你不知道哪里漏水了，多出来的水费一样会让你很心疼。

云迹这个项目正好解决了这个痛点，叶鋆郴认为，“云迹”项目体现出了三方面应用价值：第一，演示了企业在云上部署架构下统一成本分析、关键指标监控告警的问题；第二，考虑到云上账单和资源成本的数据量巨大，统计分析实时查询、告警要求多，项目采用了 TiDB 作为存储和计算引擎，发挥了 TiDB 在 HTAP 应用场景下的价值。比如遇到异常情况下，如果告警不及时，有可能就会带来很大的财产损失，TiDB 的 HTAP 能力正好满足了海量数据场景下的实时性要求；第三，本次 Hackathon 主办方为参赛者提供了一些 TiDB Cloud 和 AWS 的免费额度，在云上为团队搭建应用、部署、开发提供了更好的便捷性。

## 让数据库迁移不再像开盲盒——TiKey

“敲代码不喊我是吧”团队的项目“TiKey”（项目链接： [https://github.com/cutecutecat/TiKey ](https://github.com/cutecutecat/TiKey)）则解决了企业的另一个痛点——兼容性。姚维分享了一个曾经的痛苦经历：当年在给一些客户项目做 POC 的时候，跑到线上才发现数据库出现各种各样的问题，数据导到一半被迫停止，过程特别痛苦。

“敲代码不喊我是吧”队长陈俊宇表示，“TiKey”项目会极大节省这个时间，它原理上是一个 MySQL 协议检查器/审计工具，用于在进行 SQL 协议的迁移前，检查不符合 TiDB 规范的协议，并提供部分错误描述。

![TiKey.png](https://img1.www.pingcap.com/prod/Ti_Key_e36d645ec0.png)

其实各种语言都会有自己的检查器，如 Rust 有 clippy，Python 有 autopep8 ，这些检查器会检查你写的一些代码语句中的错误。有时候你写的有些代码并不一定错误，但是可能语法上存在一些问题，比如同样一个语句，它在 MySQL 中能够正常运行，但是放在 TiDB 中可能就不能运行了，TiKey 就是检查不同数据库之间存在兼容性问题的工具，并且还能自动地给出相应的分析和说明，告诉你这个语句哪里除了问题，应该如何解决，或者附上一些链接，告诉你去哪里找到解决方案。它使用了规则预注册模型，规则定义与检查器分离，支持快速拓展新规则，或者随着 TiDB 版本更新对现有规则进行修订。

以前，当你从 MySQL 迁移到 TiDB 的时候，需要人工检查每一句代码是否有问题，问题出在哪里，整个过程非常像开盲盒，运气好没什么问题，运气不好就可能在一个项目里陷进去几个月出不来。即使是在同一个数据库的不同版本中迁移升级，也会经常遇到新版本的特性和旧版本不兼容。所以很多公司会长期锁定一个版本，即便发布了新版本，也不敢轻易升级。一直等到这个版本已经失去支持，官方不再维护时，才会拉一群人拉通对齐，经过无数次尝试才能将这个迁移工作推进下去。“TiKey”这个项目可以非常显著地节省企业人力的工作时间。

TiDB 在用户中其实一直都以高度兼容 MySQL 著称，“敲代码不喊我是吧”为什么还会尝试这样一个方向呢？陈俊羽提出其实 TiDB 对 MySQL 的兼容性已经做得相当好，这才让团队能够在 Hackathon 这么短的时间内完成项目，如果兼容性比较差，项目实施中将会有上百条规则需要人为导入检查器。在 Hackthon 短短的几天中，很难将完成度提升到可展示的级别，这个项目在预研时也就很难成立。

## 如何衡量应用组项目价值？——完成度、便捷性、长期规划

在评委沈旸的眼中，能令他打出高分的项目要满足几个标准：第一是项目的完成度。一个项目到应用层，实际上已经是一个从 idea 到落地的过程，最终这个应用是要能直接交付给最终用户使用的。所以，应用的完成度要考虑到用户使用的便捷性，有没有解决用户真实的应用场景问题。第二，需要看该应用对未来的规划。Hackathon 比赛中不管选手投入多少时间，都是一个很短的周期，能完成的功能比较有限。所以作为评委，需要看这个应用有没有一个更长期、更完整的规划，下一步要怎么做？有没有做过市场调研？未来的用户在哪里？

云迹和 TiKey 在本次 TiDB Hackathon 大赛中在完成度和未来规划都有着非常好的表现，也因此分别收获二等奖 + 最佳人气奖和三等奖+最佳校园奖。两位队长也给未来想参加 TiDB Hackathon 的选手们送上一些 tips，希望帮助更多选手可以打开视角，基于 TiDB 打造出更多具有创意的项目：

**叶鋆郴**：第一，参加 Hackathon 前期准备非常重要。建议大家可以多花些时间在选题上，选题确认后，再对项目做一些可行性分析，这样我们就能清楚地知道在比赛中每一步要做什么以及能不能在规定时间内实现这些功能点；第二，如果 DEMO 演示中涉及到一些敏感数据或者比较难获取的数据，可以用仿真的方式来做演示。其实大家只要通过仿真场景了解项目的核心功能就可以；第三，要快乐比赛。我们团队每一次比赛都是很欢乐的，获奖和名次其实没那么重要，既然参赛了就要享受比赛，少些顾虑。

**陈俊羽**：第一也是可行性分析。因为 TiDB Hackathon 不允许抢跑，比赛开始前我们还不能写代码。但是在这段时间我们其实可以对项目创意进行技术选型，当这些东西确认好，后面才能在比赛中用非常短的时间将整个原型开发出来。第二，可能有些人一开始并不相信自己能成功参加这样一场比赛。但是没关系，大家都有第一次，只要相信自己，放手去参加一次就会得到很多收获。Hackathon 的意义就是挑战不可能，很多项目都是一边设计一边修改一边实现，在这个过程中你可以学习到很多新的知识，也会认识很多新的朋友，去感受快乐！第三，对于像我一样的学生小伙伴，我建议平时去培养比较好的编码能力，尽可能去参与一些开源社区活动，多学习多交流，构建自信，提升综合能力。