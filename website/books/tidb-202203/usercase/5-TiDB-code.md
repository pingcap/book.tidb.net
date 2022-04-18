# TiDB源码系列之沉浸式编译TiDB

**作者：Jiawei**



# 1.背景

最近刚学习完PCTP，对TiDB的各种读写有了粗略的了解，但是要想研究的更细节一些的东西， 肯定离不开学习源码，学习源码的话大家可以参考官方的TiDB源码系列文章，但是官方的文章 都是18年发的，可能会有些滞后，所以大家可以参考这个以及结合源码去学。 `TiDB源码系列解读文章`：[官方源码解读博客地址](https://pingcap.com/zh/blog?tag=TiDB 源码阅读) 然而学习源码肯定编译调试源码是最有效的学习途径，经过这几天的学习，以及请教开发大佬， 成功编译了TiDB，所以分享给对源码感兴趣的小伙伴。

# 2.准备工具

```
Goland白嫖款一个(30天)` `TiDB 最新款源码tar包一份` `Mac一台
```

# 3.源码下载

1.首先去github上下载源码：[源码下载地址](https://github.com/pingcap/tidb/releases) 2.选择自己想要看的版本:这里我以最新的5.4.0版本为例。 ![在这里插入图片描述](https://img-blog.csdnimg.cn/6c4f38208736416f977fdce0b065d0b7.png?x-oss-process=image/watermark,type_d3F5LXplbmhlaQ,shadow_50,text_Q1NETiBA5riU5LiN5piv6bG8,size_20,color_FFFFFF,t_70,g_se,x_16) 3.解压tar包

```bash
#1.打开终端
#2.到对应目录解压tar包
tar -xzvf tidb-5.4.0.tar.gz
#解压后就会得到一个文件夹
```

# 4.编译软件下载配置

由于TiDB是使用的go语言编写的，所以我们使用`goland`进行编译。 1.下载一个30天白嫖版，有能力的可以直接购买付费版(支持正版) 下载地址：[goland下载地址](https://www.jetbrains.com/go/download/#section=mac) 选择适合自己的电脑系统的进行下载： ![在这里插入图片描述](https://img-blog.csdnimg.cn/5dd090e5301044158e0ab41bb9382ba1.png?x-oss-process=image/watermark,type_d3F5LXplbmhlaQ,shadow_50,text_Q1NETiBA5riU5LiN5piv6bG8,size_20,color_FFFFFF,t_70,g_se,x_16) 2.安装完成之后选择对应打开的项目。 ![在这里插入图片描述](https://img-blog.csdnimg.cn/0131bc2e5634404fba14fb2fb98c93a5.png?x-oss-process=image/watermark,type_d3F5LXplbmhlaQ,shadow_50,text_Q1NETiBA5riU5LiN5piv6bG8,size_20,color_FFFFFF,t_70,g_se,x_16) 3.找到自己刚才解压的TiDB源码文件夹，打开 ![在这里插入图片描述](https://img-blog.csdnimg.cn/ae9e745aa8e74ca5a255835af9214d11.png?x-oss-process=image/watermark,type_d3F5LXplbmhlaQ,shadow_50,text_Q1NETiBA5riU5LiN5piv6bG8,size_20,color_FFFFFF,t_70,g_se,x_16) 4.打开后可能会出现很多的报错(如下图)，但是问题不大，基本都是因为没有安装go的相关module导致的。 ![在这里插入图片描述](https://img-blog.csdnimg.cn/89c22c8f7fc64597b3b99e0ea5528b9c.png?x-oss-process=image/watermark,type_d3F5LXplbmhlaQ,shadow_50,text_Q1NETiBA5riU5LiN5piv6bG8,size_20,color_FFFFFF,t_70,g_se,x_16) 所需的gomodule可以在代码中的下面文件看到，可以看到目前都是红色，说明缺少对应的mod。 ![在这里插入图片描述](https://img-blog.csdnimg.cn/f55b66deea89479980d5e93538ba71ec.png?x-oss-process=image/watermark,type_d3F5LXplbmhlaQ,shadow_50,text_Q1NETiBA5riU5LiN5piv6bG8,size_20,color_FFFFFF,t_70,g_se,x_16)

5.打开goland的设置，然后下载最新版的goroot，就会安装所需的module。 ![在这里插入图片描述](https://img-blog.csdnimg.cn/7c68b6c1cd594518bd39c1d136cd6476.png?x-oss-process=image/watermark,type_d3F5LXplbmhlaQ,shadow_50,text_Q1NETiBA5riU5LiN5piv6bG8,size_20,color_FFFFFF,t_70,g_se,x_16) 然后选择一个最新的版本下载就好。 ![在这里插入图片描述](https://img-blog.csdnimg.cn/60ee97bf50ad493ea1f9f09759ee1864.png?x-oss-process=image/watermark,type_d3F5LXplbmhlaQ,shadow_50,text_Q1NETiBA5riU5LiN5piv6bG8,size_20,color_FFFFFF,t_70,g_se,x_16) 然后在下面就会开始下载相关的依赖： ![在这里插入图片描述](https://img-blog.csdnimg.cn/c45b39f84f254417a328f456230fb585.png?x-oss-process=image/watermark,type_d3F5LXplbmhlaQ,shadow_50,text_Q1NETiBA5riU5LiN5piv6bG8,size_20,color_FFFFFF,t_70,g_se,x_16) 测试的时候发现只会下载一部分，所以剩下的缺少的可以点击图片中的从github sync。 ![在这里插入图片描述](https://img-blog.csdnimg.cn/1c15b9538dfb4beeb59b0fce9e8ef85e.png?x-oss-process=image/watermark,type_d3F5LXplbmhlaQ,shadow_50,text_Q1NETiBA5riU5LiN5piv6bG8,size_20,color_FFFFFF,t_70,g_se,x_16) 下载完成之后就会全部变绿，至此环境我们就配置好了。 ![在这里插入图片描述](https://img-blog.csdnimg.cn/1bd483f55eaf46af990162af34775219.png?x-oss-process=image/watermark,type_d3F5LXplbmhlaQ,shadow_50,text_Q1NETiBA5riU5LiN5piv6bG8,size_20,color_FFFFFF,t_70,g_se,x_16)

# 5.编译过程

经过上面的步骤，基本一切环境已经就绪，接下来我们就可以自己编译TiDB数据库。 1.但是会又有一个问题`从哪开始运行？` 这里还是要借助我开始说的官方源码系列：[如何学习TiDB源码](https://pingcap.com/zh/blog/tidb-source-code-reading-2) 作为一个非专业开发人员，只能借助官网提示去学习。 从我上面的地址，大家可以看到TiDB源码文件对应什么，以及从哪里开始。 ![在这里插入图片描述](https://img-blog.csdnimg.cn/df1628fd88fb4a83ac69bcb14bfa3473.png?x-oss-process=image/watermark,type_d3F5LXplbmhlaQ,shadow_50,text_Q1NETiBA5riU5LiN5piv6bG8,size_20,color_FFFFFF,t_70,g_se,x_16) 2.从上面我们可以从官方博客知道从tidb-server/main.go运行 首先main.go里面的var就是我们系统的启动参数，大家可以修改对应的参数进行启动 ![在这里插入图片描述](https://img-blog.csdnimg.cn/89af8e678cf4474db39d16d7c67ac942.png?x-oss-process=image/watermark,type_d3F5LXplbmhlaQ,shadow_50,text_Q1NETiBA5riU5LiN5piv6bG8,size_20,color_FFFFFF,t_70,g_se,x_16)

然后下面找到main函数旁边的绿色按钮，大家可以选择debug模式或者直接运行，这里我选择Debug模式，可以看到更多的信息。 ![在这里插入图片描述](https://img-blog.csdnimg.cn/164c4c63e5f34fcb930965ace14ed490.png?x-oss-process=image/watermark,type_d3F5LXplbmhlaQ,shadow_50,text_Q1NETiBA5riU5LiN5piv6bG8,size_20,color_FFFFFF,t_70,g_se,x_16) 点击之后需要等待一会儿，屏幕下方会显示compiling.. 编译完之后，大家就可以在debug栏看到对应的信息： 可以看到`[INFO] [server.go:246] ["server is running MySQL protocol"] [addr=0.0.0.0:4000]`说明启动成功了。 ![在这里插入图片描述](https://img-blog.csdnimg.cn/e1ab236818534e41bcbf8cbac17c74c6.png?x-oss-process=image/watermark,type_d3F5LXplbmhlaQ,shadow_50,text_Q1NETiBA5riU5LiN5piv6bG8,size_20,color_FFFFFF,t_70,g_se,x_16) 3.去访问看看是否真正运行成功。 可以看到TiDB服务已经在运行， 使用MySQL命令行访问TiDB，可以看到已经O K，至此编译完成。 ![在这里插入图片描述](https://img-blog.csdnimg.cn/56385d0f3b934f508ce581265a5d9f7c.png?x-oss-process=image/watermark,type_d3F5LXplbmhlaQ,shadow_50,text_Q1NETiBA5riU5LiN5piv6bG8,size_20,color_FFFFFF,t_70,g_se,x_16)

# 6.最后

运行成功后，大家后续就可以通过对不同的函数打断点，然后看自己的SQL会调用哪些代码中的哪些函数。函数的位置可以参考官方博客源码解析进行断点测试。