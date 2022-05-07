---
title: TiDB 6.0 Book Rush 贡献指南
hide_title: true
---
# TiDB 6.0 Book Rush 贡献指南

## 一、在专栏撰写和提交文章

### 1. 文章发布入口-社区专栏：https://tidb.net/blog

> 点击右上角发布文章

![](https://asktug.com/uploads/default/original/4X/2/6/8/26858c132942a9de0a1a2b8023521e14bd67a25f.png) 


### 2. 撰写文章，为文章选择正确分类及 **“6.x 实践”标签**

> * 本地撰写完成，可直接复制黏贴提交
> * 直接撰写时，请随时点击下方的“保存草稿”，避免内容丢失

![](https://asktug.com/uploads/default/optimized/4X/2/8/7/287728a058505a1bcdf41b72194b49e2cdff5658_2_1380x822.png) 

### 3. 文章审核，1-3个工作日内审核

> 社区的布道师组委会可能会对文章提出一些优化建议，按照建议优化后即可通过审核；这样即使你的文章不能入选 Book Rush，也可以被其他人看到和学习；

### 4. 文章发布奖励：

> 发布文章可获得 100-600经验值&积分，规则参考：[专栏 - 专栏技术文章发布指南&奖励 ](https://tidb.net/blog/66c5e81b)

### 5. Book rush 筛选

> 我们会定期 review “6.x 实践”标签下的文章，通过筛选的文章可以入选 Book Rush，运营小助手会邀请你来 Book rush 提交 pr

## 二、在电子书项目提交新文章

### 1. 登录/注册 GitHub （已有账号请忽略）

点击：https://github.com/ ，注册或者登录你的账号

> 如果已有账号，请点击右上角“Sign in”登录；没有账号则点击“Sign up”注册账号。

![](https://asktug.com/uploads/default/original/4X/2/6/6/266bb86f4303e49b56188e67991d02f7699ddc38.jpeg) 

### 2. fork 电子书项目

点击：https://github.com/pingcap/book.tidb.net ,点击右上角的“fork”按钮

>右上角还有 Star 按钮：为了表明你对项目的喜爱，可以点下小星星 🌟

![](https://asktug.com/uploads/default/original/4X/7/c/4/7c4e8bfcdaf9a8e9dbc2e76492621e936a4ea637.png) 

### 3. 为通过筛选的文章生成 md 文档

> 把专栏文章复制黏贴到 https://markdown.com.cn/editor/ ，调整好格式之后，点击：文件-导出 Markdown ，把文章导出为 md 文档。

![](https://asktug.com/uploads/default/original/4X/3/4/d/34da414481aaf18e23c6781d310a9323b837ee0c.png) 

> Markdown 基本语法学习：https://markdown.com.cn/basic-syntax/

### 4. 找到目录提交文章

> Book Rush 电子书地址：https://github.com/pingcap/book.tidb.net/tree/main/website/book-rush

#### 4.1 找到你要发布文章的一级目录

> 下图展示了 repo 中的文件夹和电子书实际展示出来的目录对应关系。比如 index.md 和书名对应，“1-features”文件夹对应了“第一章：TiDB 6.0 原理和特性”。

![](https://asktug.com/uploads/default/original/4X/f/f/2/ff28dd2a140894924d1cfe1f116e0181b5be5db1.png) 

#### 4.2 找到你要发布文章的二级目录

> 一级目录下的下一级目录中，以“3-manageability 文件夹”为例，也是类似的对应关系，“1-tiem-pratice” 文件夹对应了“1. TiEM 体验”这一小节（如有不懂可以找运营小助手）

![](https://asktug.com/uploads/default/original/4X/6/7/d/67d11a7b8e4cb71fe1d6be3dcf3e258205a6855d.png) 

#### 4.3 在二级目录下提交文章

1. 第一步：找到你要上传的目录地址，在这个目录下点击“Upload files”

![](https://asktug.com/uploads/default/original/4X/1/6/b/16bb7a731236cffa67033312a0fa81f50372977f.png) 

2. 第二步: 点击“choose your files”， **上传本地 md 文档**

![](https://asktug.com/uploads/default/original/4X/3/9/8/398b376c259eaea600cdf78341823cc27673efea.png) 

3. 第三步：写明文章标题和文章介绍（简短即可）

![](https://asktug.com/uploads/default/original/4X/9/a/d/9adcbe7e459918ad49b469c7342d6e9a733bdb3a.png) 

点击最下方“Commit changes”，这个文档就上传到你 fork 的项目中啦

### 5. 提交 PR

#### 5.1 找到 fork 的电子书项目

Fork 成功后，点击右侧用户名下拉列表，进入 Your repositories 页面，就可以看到你 fork 的项目了

![](https://asktug.com/uploads/default/original/4X/1/6/9/16959c25e0f2d352676ff11ce5715e725d725792.png) 

#### 5.2 点击“Pull Request”标签页下的“New Pull Request”

![](https://asktug.com/uploads/default/original/4X/c/a/5/ca5b0596f5d774ff6b73e33705833893b7586385.png) 

跳转的页面中会自动比较你 fork 的项目和主仓间的差异，如果你确认这些差异没有误操作是你要提交内容，就点击“Create pull request”

![](https://asktug.com/uploads/default/original/4X/7/2/1/721ace90ff98b5e527949eae1ad7d9b34213b8ed.png) 

#### 5.3 描述 pr 提交内容，完成 pr 创建

然后，在跳出的页面中简明扼要的描述你要提交的内容，然后点击“Create pull request”，pr 即创建成找

![](https://asktug.com/uploads/default/original/4X/2/e/8/2e894e006f7bf361e4bb1334f495b78a00f8c3cb.png) 

#### 5.4 等待 review

> 着急可联系运营小助手。

等待 reviewer 审核即可，你可以选择点击右侧的“request”，通知 reviewer 去 review 你的 pr，ta 会收到邮件提示。

![](https://asktug.com/uploads/default/original/4X/6/1/5/615ad2543265dd5c2deca30a47817833fb9dc8b3.png) 

#### 5.5 取消 pr

最下方有“Close pull request”，点击即可取消 pr

![](https://asktug.com/uploads/default/original/4X/7/6/b/76bf80bf00a66cb0c258ed1a5b876a02cec01e73.png) 

### 6. 签署 CLA

如果你是第一次给 bookrush 贡献 pr，在你提交 pr 后，会收到签署 CLA 的提示，点击这个链接，按照指引操作签署即可。

![](https://asktug.com/uploads/default/original/4X/9/f/8/9f8945cfd306d9e8e41ef4bfff008594180ebe9e.png) 

### 7. pr review & merge

项目的 reviewer 在 review 你的 pr 时，可能会提一些修改的 comment。如果你对于这些 comment 有异议，可以在这里展开讨论；没有异议的话需要根据这些 comment 进行修改。

没有问题后，reviewer 会 merge 你的 pr，这时回到电子书页面，点击到对应的目录，你就可以看到自己刚刚提交的文章啦~https://tidb.net/book/book-rush

## 三、修改电子书中的文章

如果你想要修改自己提交的文章，或者发现其他人的文章中有错别字，都可以通过下面的操作来提交 pr。

### 1、找到文档所在的 GitHub 地址

首先，在电子书页面要修改的文章中，点击左下角“Edit this page”就会直接跳转到文档所在的 GitHub 地址。

![](https://asktug.com/uploads/default/original/4X/1/6/e/16e9176c7b39dbc306758d12bc45875b91566d96.png) 

![](https://asktug.com/uploads/default/original/4X/d/3/7/d37f4cc13ff3a7b668e227e0210086838efa79d9.png) 


### 2、 修改 fork 项目

点击“Edit this file”就可以对这个文档进行修改了

![](https://asktug.com/uploads/default/original/4X/5/7/0/570ea83a8755d55f8789034b099676a27096bcf1.png)

编辑完成后，拉到最下方，点击“Commit changes”，这些修改就提交在自己的仓库中了。建议在文本框内详细写清楚自己修改的内容，方便对自己的修改一目了然。

![](https://asktug.com/uploads/default/original/4X/c/c/2/cc248b41f3b4bd27a1e413751dea1dd700b8e06f.png)

> 提示：当前只是自己的账户有修改，实际上电子书所在的项目是没有任何变动的。

### 3、 提交 pr，将修改同步到主库

参考步骤 5 提交 PR

## 四、Q&A

### Q1、文章中的图片应该如何处理呢？

A：找到专栏中提交的文章，复制图片地址

![](https://asktug.com/uploads/default/original/4X/1/6/2/162878ff896ecddd37ee746b92339a5ad57571b6.png) 

按照 markdown 文档的格式，添加到文档中即可，如上图的图片在 md 文档中的代码如下：

`![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1650972689089.png)`