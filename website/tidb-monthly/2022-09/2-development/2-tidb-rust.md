---
title:文盘Rust -- 如何把配置文件打包到二进制文件里 - TiDB 社区技术月刊
sidebar_label: 文盘Rust -- 如何把配置文件打包到二进制文件里
hide_title: true
description: 在实际开发中，经常会遇到各种不同的配置文件。本文将展示如何把配置文件打包到二进制文件里。
keywords: [TiDB, Rust, 配置文件, 二进制文件]
---

# 文盘Rust -- 如何把配置文件打包到二进制文件里

> 作者：[jiashiwen](https://tidb.net/u/jiashiwen/answer)

notice"Rust is a trademark of the Mozilla Foundation in the US and other countries."

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/WechatIMG360-1659324096657.jpeg)

在实际开发中，经常会遇到各种不同的配置文件。通常，程序运行的各种配置从外部读取，以增强应用配置的灵活性。java 生态中的 springboot 提供了这种设计的典范。springboot 的应用程序，默认通过 application.yml 加载配置。默认的 application.yml 文件打进 jar 包，如果想改变程序的行为，可以在jar 包的同级目录下创建 application.yml 文件或者通过参数指定配置文件位置。那么在 rust 生态里有没有办法把默认配置文件打包到二进制文件呢。我们可以通过 [rust-embed](https://github.com/pyrossh/rust-embed)  第三方库来实现这一效果。在实际开发中的典型场景是: 不指定任何配置文件时，使用默认配置文件；当应用程序同级目录下包含配置文件时加载该配置文件。

- 定义嵌入文件的位置及获取函数src/resources/embed_resource.rs 中定义了嵌入文件的位置及获取函数

  ```
  use rust_embed::RustEmbed;
  
  #[derive(RustEmbed)]
  #[folder = "src/embedfiles/"]
  struct Asset;
  
  pub fn get_app_default() -> Option<rust_embed::EmbeddedFile> {
    Asset::get("./app_default.yml")
  }
  ```

- 宏定义了嵌入文件的目录 '#[folder = "src/embedfiles/"]',获取文件函数以该目录为根。

- 使用嵌入文件

  ```
  fn main() {
    if Path::new("./app.yml").exists() {
        let contents =
            fs::read_to_string("./app.yml").expect("Read file error!");
        println!("{}", contents);
        return;
    }
    let app = get_app_default().unwrap();
    let f = std::str::from_utf8(app.data.as_ref()).unwrap();
    println!("{}", f);
  }
  ```

- 按照优先级，我们先检查应用同级目录下有没有app.yml文件，如果有就加载，否则加载默认配置文件。我们先前定义的获取嵌入文件的函数会返回rust_embed::EmbeddedFile 的 struct。通过解析该 struct 的 data 成员，获取文件内容。

- 测试为了避免干扰，我们把编译好的应用 mv 到 /tmp 目录

  ```
  cargo build
  mv target/debug/embed /tmp
  ```

- 先执行 embed ，可以看到，输出的是默认配置文件的内容；在应用程序同级目录建立 app.yml 文件，随便填写些内容，再执行 embed 则输出的是 app.yml 文件的内容。

[源码地址](https://github.com/jiashiwen/wenpanrust/tree/main/embed) 以上示例在 macos 上编译执行通过，咱们下期见
