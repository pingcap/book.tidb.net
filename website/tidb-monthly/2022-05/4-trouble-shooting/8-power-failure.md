---
title: 一次断电故障引起TiDB无法启动的问题带来的几点思考
hide_title: true
---

# 一次断电故障引起TiDB无法启动的问题带来的几点思考

> 作者：**[xuexiaogang](https://tidb.net/u/xuexiaogang/post/all)** 发表于  **2022-05-23**

​         上周测试环境一台物理机主板坏了，CPU上的稳压器有问题，然后一下子停机了。恰好我的一个单机简易集群tidb在上面。我们公司不用tidb，所以这个有且仅有这么一台练习环境给到我，只能安装简易版的。

​        今天我登录时候发现命令行不能登录。检查集群状态是这样的。

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1653277862809.png)﻿﻿

两个主要的组件没起来，连不上正常。想到了估计是上周的问题导致，第一感觉由于平时没有读写。这种情况下理论上即使断电也不影响影响。

其他组件启动成功，但是tikv和tidb两个组件没启动。我第一想法是整体关闭再重启一下。

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1653287075818.png)﻿﻿

非常吃惊，ssh的密码过期，无法启动。如果不是因为这次断电重启一直不会报这个错。恰巧重启验证账户。**留给大家一个经验，tidb所在的机器不要给账户设置过期密码，否则就是给自己挖坑。**

再请管理虚拟化的同事帮忙恢复密码。现在问题是这样的，tikv和tidb依旧无法启动。由于启动顺序是先tikv所以tikv不成功，tidb也无从谈起。

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1653287249287.png)﻿﻿

根据提示看日志。

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1653287322195.png)﻿﻿

这个是操作系统的错误码。经过查看具体情况是这样。OS层面的这个第一次遇见，其实没有方向。

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1653287430469.png)﻿﻿

经过查找资料发现这种多数都是由于断电导致。这里就带来我的第二个思考。**虚拟机这种多了一层，出了问题增加排障难度。tidb虽然是多节点，但是我觉得tikv等这些主要的，还是物理机部署比较好。**

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1653287499245.png)﻿﻿

我尝试进行修复，但是发现无法修复。即使我把全部集群停止，都无法修复。可能有人遇到过类似的问题，但是我实际上无法参考那些帖子处理。

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1653288002339.png)﻿﻿

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1653288072282.png)﻿﻿

最后采用重建解决。好在tidb的全局管理做的非常好。重建只需要两个命令。

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1653288136597.png)﻿﻿

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1653288168572.png)﻿﻿

﻿

总结一下：

1、我个人觉得tidb的tikv和tidb、tiflash最好物理机部署。按照官方多节点，一个节点出问题不至于全局。

2、千万不要设置密码过期，否则一旦过期重启会有不必要的麻烦。

3、虚拟机静态节点断电不代表没有风险。