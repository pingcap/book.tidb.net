---
title: 文盘Rust -- 起手式，CLI程序 - TiDB 社区技术月刊
sidebar_label: 文盘Rust -- 起手式，CLI程序
hide_title: true
description: 本文将介绍如何通过几个步骤快速的实现一个功能相对齐全的CLI程序：如何通过interactcli-rs实现一个功能齐全的命令行程序。
keywords: [TiDB , RUST, CLI, interactcli-rs]
---

# 文盘Rust -- 起手式，CLI程序

> 作者：[jiashiwen](https://tidb.net/u/jiashiwen/answer)

notice"Rust is a trademark of the Mozilla Foundation in the US and other countries."

 ![文盘rust](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/3601646711157_.pic_hd-1646713497059.jpg) 

上次发了一篇关于Rust生命周期引起锁问题文章。没想到公众号转发的时候,就收到了几位资深研发同学的留言。有指正错误的，也有提供新方法的，在此表示感谢。作为Rust的资深初学者(毕竟是二刷Rust了)，我本人也正在经历一门新语言从不会到熟悉的过程，觉得有必要记录一下这个过程。技术的学习从不会到会的过程是最有意思的，也是体会最多的。一旦熟练了，知识变成了常识，可能就失去了记录学习过程的最佳时机。

在我看来学习一门计算机语言和学习人类语言有很多共通之处。我们学习人类语言是从单个的词开始，然后是简单句子，通过不断的与他人交互练习掌握语法和语言习惯。当熟练到一定程度就可以表达思想。计算的语言也差不多，熟悉关键词，基本逻辑，标准库，写应用。只是沟通的对象是机器而已。

既然是学就不能在开始搞的太难。学习本来就是个艰苦的差事。上来就干特别复杂的事情往往会坚持不下去。天下难事必做于易，从简入繁，从易到难，方为正道。

先聊聊最简单的CLI(Command Line Interface)程序。其实我们每学习一门语言的 hello world 程序就是CLI，只是没那么多交互而已。

做命令行程序最繁琐的事情是处理交互。交互大体分两种。一种是我们最熟悉shell下的交互模式，每次一个命令，配合参数实现一次处理返回一组结果。这种模式处理起来比较容易Rust也有相当优秀的第三方lib ([clap](https://crates.io/crates/clap))。第二种是领域交互，就像我是使用MySql或者redis的客户端程序。这种程序可以玩儿的东西就比较多了像如何实现交互，如何来做子命令的提示。这些东西 clap 并没有提供，需要我们自己来实现。

[interactcli-rs](https://github.com/jiashiwen/interactcli-rs)是我在工作过程中做的一个交互模式命令行脚手架。实现了一些常用功能。

下面我们来看看如何通过几个步骤快速的实现一个功能相对齐全的CLI程序。和做饭一样，能够快速获得成就感的方式是找半成品直接下锅炒一盘：）。

下面我们具体看看，如何通过interactcli-rs实现一个功能齐全的命令行程序

## 来点感性认识

先把项目clone下来运行个例子

- clone 项目

```
  git clone https://github.com/jiashiwen/interactcli-rs.git
  cd interactcli-rs
```

- 命令行模式

```
  cargo run requestsample baidu
```

- 交互模式

```
  cargo run -- -i
  interact-rs> requestsample baidu
```

运行上面的命令是通过http来请求百度

## 四步做个CLI

首先我们先来看看框架的目录结构

```markdown
.
├── examples
├── log
├── logs
└── src
    ├── cmd
    ├── commons
    ├── configure
    ├── interact
    ├── logger
    └── request
```

cmd目录是我们做自己功能时要动的主要目录，下面我们一步一步的实现requestsample命令。

- 定义命令cmd 模块用于定义命令以及相关子命令,requestsample.rs 中定义了访问百度的命令

```
  use clap::Command;
    
  pub fn new_requestsample_cmd() -> Command<'static> {
  clap::Command::new("requestsample")
  .about("requestsample")
  .subcommand(get_baidu_cmd())
  }
  
  pub fn get_baidu_cmd() -> Command<'static> {
  clap::Command::new("baidu").about("request www.baidu.com")
  }
```

- new_requestsample_cmd 函数定义了命令 "requestsample",get_baidu_cmd 函数定义了 requestsample 的子命令 baidu

- 注册命令src/cmd/rootcmd.rs 文件中定义了命令树，可以在此注册定义好的子命令

```
  lazy_static! {
      static ref CLIAPP: clap::Command<'static> = clap::Command::new("interact-rs")
          .version("1.0")
          .author("Your Name. <yourmail@xxx.com>")
          .about("command line sample")
          .arg_required_else_help(true)
          .arg(
              Arg::new("config")
                  .short('c')
                  .long("config")
                  .value_name("FILE")
                  .help("Sets a custom config file")
                  .takes_value(true)
          )
          .arg(
              Arg::new("daemon")
                  .short('d')
                  .long("daemon")
                  .help("run as daemon")
          )
          .arg(
              Arg::new("interact")
                  .short('i')
                  .long("interact")
                  .conflicts_with("daemon")
                  .help("run as interact mod")
          )
          .arg(
              Arg::new("v")
                  .short('v')
                  .multiple_occurrences(true)
                  .takes_value(true)
                  .help("Sets the level of verbosity")
          )
          .subcommand(new_requestsample_cmd())
          .subcommand(new_config_cmd())
          .subcommand(new_multi_cmd())
          .subcommand(new_task_cmd())
          .subcommand(new_loop_cmd())
          .subcommand(
              clap::Command::new("test")
                  .about("controls testing features")
                  .version("1.3")
                  .author("Someone E. <someone_else@other.com>")
                  .arg(
                      Arg::new("debug")
                          .short('d')
                          .help("print debug information verbosely")
                  )
          );
      static ref SUBCMDS: Vec<SubCmd> = subcommands();
  }
  
  pub fn run_app() {
      let matches = CLIAPP.clone().get_matches();
      if let Some(c) = matches.value_of("config") {
          println!("config path is:{}", c);
          set_config_file_path(c.to_string());
      }
      set_config(&get_config_file_path());
      cmd_match(&matches);
  }
  
  pub fn run_from(args: Vec<String>) {
      match clap_Command::try_get_matches_from(CLIAPP.to_owned(), args.clone()) {
          Ok(matches) => {
              cmd_match(&matches);
          }
          Err(err) => {
              err.print().expect("Error writing Error");
          }
      };
  }
```

- 定义好的命令不需其他处理，框架会在系统运行时生成子命令树，用于在领域交互模式下命令提示的支持

- 命令解析src/cmd/rootcmd.rs 中的 cmd_match 负责解析命令，可以把解析逻辑写在该函数中

```
  fn cmd_match(matches: &ArgMatches) {   
    if let Some(ref matches) = matches.subcommand_matches("requestsample") {
        if let Some(_) = matches.subcommand_matches("baidu") {
            let rt = tokio::runtime::Runtime::new().unwrap();
            let async_req = async {
                let result = req::get_baidu().await;
                println!("{:?}", result);
            };
            rt.block_on(async_req);
        };
    }
  }
```

- 修改交互模式的命令提示提示符可以在src/interact/cli.rs 中定义

```
  pub fn run() {
    
    ...
  
    loop {
        let p = format!("{}> ", "interact-rs");
        rl.helper_mut().expect("No helper").colored_prompt = format!("\x1b[1;32m{}\x1b[0m", p);
  
        ...
    }
    
    ...
  }
```

先写到这里，下次为大家介绍一下interactcli-rs各种功能是如何实现的。