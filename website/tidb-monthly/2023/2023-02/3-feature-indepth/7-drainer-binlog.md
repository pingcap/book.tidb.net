---
title: drainer binlog 清理机制 源码详解 - TiDB 社区技术月刊
sidebar_label: drainer binlog 清理机制 源码详解
hide_title: true
description: 之前在使用drainer的时候，发现产生的binlog 都一直保留，似乎没有自动清理机制，只能用find … rm的方式去删除。本文将对drainer binlog 清理机制的原理进行源码解读。
keywords: [TiDB, drainer binlog, 清理机制, 源码解读]
---

# drainer binlog 清理机制源码详解

> 作者：Hacker_loCdZ5zu

## 一、学习背景

之前在使用drainer的时候，发现产生的binlog 都一直保留，似乎没有自动清理机制，只能用find … rm的方式去删除，由于mysql的binlog 的清理机制是通过expire_logs_days 参数进行控制的，随后找到了drainer 有1个配置参数syncer.to.retention-time 是可以自动清理drainer binlog，然而当我设置完syncer.to.retention-time =1并且reload drainer 生效后，但是1天以前的drainer binlog 一直都在，并没有被清理，这有点困惑，于是看了下 drainer binlog的清理过程，掌握binlog的自动清理原理。

## 二、binlog 自动清理机制源码工作过程

drainer binlog(以下简称binlog)除了可以用Linux的操作系统命令rm去删除以外，其实本身也维护着一个binlog的自动清理机制，涉及binlog的自动清理的函数主要是GCByTime，GCByTime 函数定义在./pkg/binlogfile/binlogger.go 384 行，下面代码是关于这个函数的定义（本文查阅的代码版本为tidb-binlog 4.0.13版本）

```markdown
// GGCByTime delete all files that's older than the specified duration, the latest file is always kept
func (b *binlogger) GCByTime(retentionTime time.Duration) {
	names, err := ReadBinlogNames(b.dir)
	if err != nil {
		log.Error("read binlog files failed", zap.Error(err))
		return
	}
	//names 其实就是binlog的文件名称

	if len(names) == 0 {
		return
	}
	//如果names 切片的长度为0，则说明获得binlog 文件名，return返回，则不需要执行接下来清理binlog的代码

	// skip the latest binlog file
	for _, name := range names[:len(names)-1] {
		fileName := path.Join(b.dir, name)
		fi, err := os.Stat(fileName)
		if err != nil {
			log.Error("GC binlog file stat failed", zap.Error(err))
			continue
			//如果这里获取某1个binlog的信息时，如果失败，并不会报错，而是接着执行
		}

		if time.Since(fi.ModTime()) > retentionTime {
			if err := os.Remove(fileName); err != nil {
				log.Error("fail to remove old binlog file", zap.Error(err), zap.String("file name", fileName))
				continue
			}
			log.Info("GC binlog file", zap.String("file name", fileName))
		}
	}
}
```

首先这个函数会接收一个retentionTime的参数，retentionTime 参数怎么计算出来的，接下来会介绍，在这个函数里面，首先通过调用ReadBinlogNames函数，ReadBinlogNames 函数会返回binlog的文件名（以切片的形式）给GCByTime 函数里面的变量names,在得到binlog 文件名以后，当然如果没有获取binlog的文件名称（通过判断切片变量names的长度是否为0），清理binlog文件的代码就到这里结束了接下来就是利用1个for 循环，去清理binlog 文件

在for 循环里面，首先会去循环names 切片，但是循环names 切片的时候，并不是取names 切片里面所有的binlog 文件名，而是把最新的1个binlog 文件名给排除了，将names切片的长度减去1，那么for 循环就不会取到最新的文件名了，其实这个设计也是合理的，因为我们并不需要去判断最新的binlog是否需要删除

下面的代码是我做的一个例子演示

```markdown
func main() {

	names := []string{"binlog-343", "binlog-344", "binlog-345"}
	//假设names 切片获取到了3个binlog 文件名称，分别是"binlog-343", "binlog-344", "binlog-345"，
	fmt.Println(len(names))                     //names 切片的长度是3
	for _, name := range names[:len(names)-1] { //将names的长度减去-1，那就是只循环names的前2个值（排除最后1个binlog-345),
		//类似于range names[0:2]
		fileName := name
		fmt.Println("the filename is:", fileName)
		//输出结果就是循环得到binlog-343，binlog-344，然后排除了binlog-345
	}

}
```

接下来，我根据GGCByTime 函数里面清理binlog的源代码，结合具体的变量，再加一些输出信息，写了一段式例代码，在这段式例代码里面可以直接利用里面的代码去清理binlog，对式例代码的逻辑都做了注释，这样有利于比较详细的去了解清理binlog的工作过程

```markdown
package main

import (
	"fmt"
	"os"
	"path"
	"time"
)

func main() {
	retentionDays := 1
	//假设自动清理binlog的周期为1天，即将1天以前的binlog 给清理掉,retentionDays的值来源于drainer的配置syncer.to.retention-time
	retentionTime := time.Duration(retentionDays) * 24 * time.Hour
	//将retentionDays 转为time.Duration 类型，计算出天数对应的小时数
	fmt.Println("the retentionTime is", retentionTime)
	fmt.Printf("the type of retentionTime is %T\n", retentionTime)
	dir := "/tidb-data/drainer-8249" //假设存储binlog的上层路径是/tidb-data/drainer-8249
	names := []string{"binlog-0000000000000000-20230205171343", "binlog-0000000000000001-20230213235157", "binlog-0000000000000002-20230213235314"}
	//names 里面的binlog 文件名称是OS上真实存在的文件名，假设目前OS上存在这三个binlog 文件名
	for _, name := range names[:len(names)-1] {
		fileName := path.Join(dir, name) //进行binlog 文件名称拼接，得到binlog 的全路径
		fmt.Println("the filename is:", fileName)
		fi, err := os.Stat(fileName)
		//通过内置os.Stat 函数获取binlog 文件的信息传给fi变量，通过继续调用相应的函数，可以获取文件的进一步详细的信息包括文件的最后修改时间或者文件大小等等
		if err != nil {
			//log.Error("GC binlog file stat failed", zap.Error(err))
			fmt.Printf("GC binlog file:%s stat failed\n", fileName)
			continue
		}
		fmt.Printf("the filename:%s modify time is %s\n", fileName, fi.ModTime())

		//通过fi.ModTime得出了 binlog的最后修改时间，输出结果就是，可以看到这两个binlog的最后修改时间就是2023-02-13 23:51:57和2023-02-13 23:53:14
		//the filename:/tidb-data/drainer-8249/binlog-0000000000000000-20230205171343 modify time is 2023-02-13 23:51:57.564463729 +0800 CST
		//the filename:/tidb-data/drainer-8249/binlog-0000000000000001-20230213235157 modify time is 2023-02-13 23:53:14.671398554 +0800 CST

		//通过time.Since(fi.ModTime())，可以知道文件的最后修改时间到现在所经历的时间，比如文件最后的修改时间是2023-02-13 23:51:57，然后现在是2023-02-14 20:57:，那么就是就是经历了21h5m
		fmt.Println(time.Now())
		fmt.Printf("the filename:%s, the time.Since is %s\n", fileName, time.Since(fi.ModTime()))
		//the filename:/tidb-data/drainer-8249/binlog-0000000000000000-20230205171343, the time.Since is 21h5m15.819739124s
		//the filename:/tidb-data/drainer-8249/binlog-0000000000000001-20230213235157, the time.Since is 21h3m58.712814602s

		if time.Since(fi.ModTime()) > retentionTime {
			//如果time.Since(fi.ModTime()) 大于retentionTime，就说明该binlog 文件 满足设定的自动清理的机制，进入清理逻辑
			if err := os.Remove(fileName); err != nil {
				//通过go 内置的os.Remove 函数去清理binlog 文件
				//log.Error("fail to remove old binlog file", zap.Error(err), zap.String("file name", fileName))
				fmt.Println("fail to remove old binlog file:", fileName)
				//输出结果
				//GC binlog file: /tidb-data/drainer-8249/binlog-0000000000000000-20230205171343
				//GC binlog file: /tidb-data/drainer-8249/binlog-0000000000000001-20230213235157
				continue
			}
			//log.Info("GC binlog file", zap.String("file name", fileName))
			fmt.Println("GC binlog file:", fileName)
		}
	}
}
```

## 三、如何设置 drainer binlog的自动清理机制

怎么让drainer binlog的自动清理机制生效，drainer 其实提供了一项配置 syncer.to.retention-time，通过在drainer 标签下面配置该参数，即可自动清理binlog

drainer的配置的可以参考<https://github.com/pingcap/tidb-binlog/blob/v4.0.9/cmd/drainer/drainer.toml#L153>, 如果想让drainer 添加binlog 自动清理的功能，tiup cluster edit-config 集群名 ，在drainer的配置下面添加下面内容即可（假设设置binlog的保留期限为4天），当然该值只能写int 类型的整数，在代码里面关于这个变量的定义就是int类型

drainer: syncer.to.retention-time: 4

设置了该参数后，GCByTime 函数里面参数 retentionTime的初始值来源就是该值，只不过需要syncer.to.retention-time 要做一个运算转为time.Duration 类型，求出天数对应的小时数，下面的代码就是关于时间转化部分的代码（源码在drainer/sync/pb.go NewPBSyncer 函数里面）

```markdown
func main() {
	retentionDays := 1
	retentionTime := time.Duration(retentionDays) * 24 * time.Hour
	fmt.Println("the retentionTime is", retentionTime) //the retentionTime is 24h0m0s
	fmt.Printf("the type of retentionTime is %T\n", retentionTime) //the type of retentionTime is time.Duration
}
```

## 四、 什么时候会触发drainer binlog的清理机制

像MySQL的binlog 清理机制，即使设置expire\_logs\_days 清理参数，也不是说每时每刻会清理MySQL的binlog，只会当刷新1个新的binlog的时候，才会触发binlog的清理机制，像drainer 也有binlog的清理触发机制，这个触发机制在drainer/sync/pb.go:55 里面，这个触发机制，简单来说就是通过通过time.NewTicker()方法创建1个定时器，定期执行binlog 清理函数(通过binlogger 这个接口从而调用GCByTime 函数)，这段代码总体如下

```markdown
if retentionDays > 0 {
		// TODO: Add support for human readable format input of times like "7d", "12h"
		retentionTime := time.Duration(retentionDays) * 24 * time.Hour
		ticker := time.NewTicker(time.Hour)
		go func() {
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					log.Info("Binlog GC loop stopped")
					return
				case <-ticker.C:
					log.Info("Trying to GC binlog files")
					binlogger.GCByTime(retentionTime)
				}
			}
		}()
	}
```

其实这段代码的逻辑是如果retentionDays大于0，就通过time.NewTicker(time.Hour) 设置了1个小时的定时器，其实在drainer.log 里面可以通过关键字grep 'Trying to GC binlog files' drainer.log 去看下这条日志是不是每小时出现一次，进入了定时器的逻辑后，通过1个goroutine 去执行binlog的清理机制（调用binlogger.GCByTime函数），当然这个逻辑涉及到用select 多路复用机制，会去判断去执行case <-ctx.Done()还是case <-ticker.C:，在这里我们只需要关心case <-ticker.C 这段代码的逻辑，也就是binlog 清理生效的机制，下面这段代码就可以演示下，定时器的执行机制

```markdown
package main

import (
	"fmt"
	"time"
)

func GCByTime() {
	fmt.Println("当前时间为:", time.Now())
	fmt.Println("Trying to GC binlog files")
}

//把GCByTime看作是清理binlog的函数

func main() {

	ticker := time.NewTicker(time.Minute)
	ch := make(chan int)
	go func() {
		defer ticker.Stop()
		var x int
		for x < 10 {
			select {
			case <-ticker.C:
				GCByTime()
				x++
			}
		}
		ch <- 0
	}()
	<-ch
}

//设置1个每分钟执行1次的定时器，总共执行10次，可以看到每分钟就会去执行函数GCByTime
//输出结果
//Trying to GC binlog files
//当前时间为: 2023-02-14 21:38:00.202515902 +0800 CST m=+120.057411844
//Trying to GC binlog files
//当前时间为: 2023-02-14 21:39:00.202873918 +0800 CST m=+180.057769859
//Trying to GC binlog files
//当前时间为: 2023-02-14 21:40:00.204637427 +0800 CST m=+240.059533376
//Trying to GC binlog files
//当前时间为: 2023-02-14 21:41:00.203653072 +0800 CST m=+300.058549012
//Trying to GC binlog files
//当前时间为: 2023-02-14 21:42:00.20327751 +0800 CST m=+360.058173469
//Trying to GC binlog files
//当前时间为: 2023-02-14 21:43:00.203484271 +0800 CST m=+420.058380227
//Trying to GC binlog files
//当前时间为: 2023-02-14 21:44:00.204593251 +0800 CST m=+480.059489204
//Trying to GC binlog files
//当前时间为: 2023-02-14 21:45:00.204139581 +0800 CST m=+540.059035540
//Trying to GC binlog files
//当前时间为: 2023-02-14 21:46:00.20308013 +0800 CST m=+600.057976081
//Trying to GC binlog files
```

## 五、结论

通过对binlog的清理机制的代码阅读，得出来以下结论:

1. 可以通过配置drainer 的syncer.to.retention-time 参数来实现binlog的自动清理，类似于MySQL的expire_logs_days 参数
2. 清理机制每小时生效一次
3. 最新的binlog 不会被自动清理