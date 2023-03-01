---
title: 通过 Jmeter 批量向 TiDB 数据库插入数据 - TiDB 社区技术月刊
sidebar_label: 通过 Jmeter 批量向 TiDB 数据库插入数据
hide_title: true
description: 在向 TiDB 数据库插入数据的时候没有变量的话会造成插入数据失败，为了尽可能模拟生产的数据，需要插入不同类型的数据使其自动生成，本文就是创建不同的数据类型来模拟对 TiDB 数据库的压测。
keywords: [TiDB, Jmeter, 批量导入数据, 压测]
---

# 通过 Jmeter 批量向 TiDB 数据库插入数据

> 作者：[lqbyz](https://tidb.net/u/lqbyz/answer)

在向TiDB数据库插入数据的时候没有变量的话会造成插入数据失败，为了尽可能模拟生产的数据，需要插入不同类型的数据使其自动生成，本文就是创建不同的数据类型来模拟对TiDB数据库的压测。具体步骤如下：

## 1、需要在tidb上开启如下设置

```SQL
SET GLOBAL tidb_multi_statement_mode='ON' 
```

## 2、批量插入数据(随机的整数)

### 方法一，以分号分割

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131558712.png)

### 方法二，参数化配置

#### 2.1、添加随机变量。在线程组jdbc user上右键--添加--配置元件--Random Variable

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131558848.png)

#### 2.2、设置随机变量的配置

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131558743.png)

#### 2.3、添加并配置JDBC Reques

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131558929.png)

#### 2.4、配置JDBC的插入数据

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131558953.png)

#### 2.5、把以上配置保存并执行，添加查看结果树，查看结果

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131558847.png)

#### 2.6、在tidb中查看

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131558279.png)

## 3、批量插入随机数据(随机字符串）

### 3.1、打开函数助手

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131559009.png)

### 3.2、打开生成随机函数

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131558977.png)

### 3.3、${\_\_RandomString(6,abcdefghigklmnopqrstuvwxyz,)}这个变量放入到需要插入的地方

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131558872.png)

### 3.4、保存并执行，查看结果

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131559061.png)

### 3.5、在数据库里查看

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131559232.png)

## 4、批量插入序列数据(顺序整数)

### 方法一：

#### 4.1、打开函数助手

函数助手两种方法：方法一通过图形界面直接点选。方法二：在jmeter菜单处点击 工具 -- 函数助手对话框 -- 下拉框选择 counter -- 进入如下界面：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131558993.png)

#### 4.2、函数助手counter中，设置TRUE

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131558579.png)

#### 4.3、配置插入语句

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131558876.png)

#### 4.4、验证数据库

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131558979.png)

### 方法二：通过计时器变量

#### 4,1、配置函数助手中的counter

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131559188.png)

#### 4.2、配置计时器

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131558874.png)

#### 4.3、配置插入语句

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131559479.png)

#### 4.4、验证数据

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131558359.png)

## 5、批量插入时间戳，通过助手函数

#### 5.1、打开函数助手

#### 5.2、配置时间函数助手

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131558469.png)

#### 5.3、配置插入语句

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131559030.png)

#### 5.4、验证语句

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131558618.png)

## 6、批量插入时间，格式年月日

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131558888.png)

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131559033.png)

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675131559113.png)
