---
title: 文盘Rust -- 给程序加个日志
hide_title: true
---

# 文盘Rust -- 给程序加个日志

**jiashiwen** 发表于  **2022-07-04**

notice"Rust is a trademark of the Mozilla Foundation in the US and other countries."

 ![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/WechatIMG360-1656897685813.jpeg) 

日志是应用程序的重要组成部分。无论是服务端程序还是客户端程序都需要日志做为错误输出或者业务记录。在这篇文章中，我们结合[log4rs](https://github.com/estk/log4rs) 聊聊rust 程序中如何使用日志。[log4rs](https://github.com/estk/log4rs) 类似java生态中的log4j,使用方式也很相似

## log4rs中的基本概念

log4rs 的功能组件也由 appender 和 logger构成。

- appender负责向指定文件或控制台追加日志
- logger包含多个 appender ，比如一条日志既要输出到控制台也要持久化到日志文件中，就可以在logger中同时绑定 ConsoleAppender 和 FileAppender

## log4rs 使用示例

- 示例描述我们需要在工程中记录系统日志和业务日志，分别记录在logs/sys.log 和 logs/business.log

- 定义 appender 和 logger 并初始化代码位置 src/logger/logger.rs

  ```
    let sys_file = FileAppender::builder()
        .encoder(Box::new(PatternEncoder::new("{d} - {m}{n}")))
        .build("logs/sys.log")
        .unwrap();
    let business_file = FileAppender::builder()
        .encoder(Box::new(PatternEncoder::new("{d} - {m}{n}")))
        .build("logs/business.log")
        .unwrap();
  
    let stdout = ConsoleAppender::builder().build();
  
    let config = Config::builder()
        .appender(Appender::builder().build("stdout", Box::new(stdout)))
        .appender(Appender::builder().build("sys", Box::new(sys_file)))
        .appender(Appender::builder().build("business", Box::new(business_file)))
        .logger(
            Logger::builder()
                .appender("sys")
                .build("syslog", LevelFilter::Info),
        )
        .logger(
            Logger::builder()
                .appender("business")
                .build("businesslog", LevelFilter::Info),
        )
        .build(
            Root::builder()
                .appender("stdout")
                .appender("file_out")
                .build(LevelFilter::Info),
        )
        .unwrap();
  
    let _ = log4rs::init_config(config).unwrap();
  ```

  代码中定义了 sys_file 和 business_file 两个FileAppender 分别用于像sys.log 和 business.log中追加日志。config 中定义了两个logger 分别绑定 sys appender 和 business appender。最后通过 init_config 初始化 log4rs。

  - 在程序中输出日志

    - 定义 uselog 命令及两个子命令，分别输入sys 日志和 business 日志。代码位置 src/cmd/cmdusedifflogger.rs

      ```
      pub fn new_use_log_cmd() -> Command<'static> {
          clap::Command::new("uselog")
              .about("use diffrent target log")
              .subcommand(new_use_sys_log_cmd())
              .subcommand(new_use_business_log_cmd())
      }
      
      pub fn new_use_sys_log_cmd() -> Command<'static> {
          clap::Command::new("syslog").about("append to syslog")
      }
      
      pub fn new_use_business_log_cmd() -> Command<'static> {
          clap::Command::new("businesslog").about("append to business log")
      }
      ```

    - 解析命令并输出日志代码位置 src/cmd/rootcmd.rs

      ```
      if let Some(ref log) = matches.subcommand_matches("uselog") {
          println!("use log");
          if let Some(_) = log.subcommand_matches("syslog") {
              log::info!(target:"syslog","Input sys log");
          }  
          if let Some(_) = log.subcommand_matches("businesslog") {
              log::info!(target:"businesslog","Input business log");
          }
      }
      ```

    - 输出时，通过 target 来区分输出到不同的logger。

本文代码的github地址：https://github.com/jiashiwen/interactcli-rs

下期见