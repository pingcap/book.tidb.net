---
title: 文盘Rust -- 子命令提示，提高用户体验
hide_title: true
---

# 文盘Rust -- 子命令提示，提高用户体验

**[jiashiwen](https://tidb.net/u/jiashiwen/answer)** 发表于  **2022-06-01**

notice"Rust is a trademark of the Mozilla Foundation in the US and other countries."

 ![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/WechatIMG360-1654048611749.jpeg) 



上次我们聊到 CLI 的领域交互模式。在领域交互模式中，可能存在多层次的子命令。在使用过程中如果全评记忆的话，命令少还好，多了真心记不住。频繁 --help 也是个很麻烦的事情。如果每次按 'tab' 键就可以提示或补齐命令是不是很方便呢。这一节我们就来说说 'autocommplete' 如何实现。我们还是以 [interactcli-rs](https://github.com/jiashiwen/interactcli-rs)  中的实现来解说实现过程。

## 实现过程

其实，[rustyline](https://github.com/kkawakam/rustyline)  已经为我们提供了基本的helper功能框架,其中包括了completer。我们来看代码，文件位置src/interact/cli.rs

```
#[derive(Helper)]
struct MyHelper {
    completer: CommandCompleter,
    highlighter: MatchingBracketHighlighter,
    validator: MatchingBracketValidator,
    hinter: HistoryHinter,
    colored_prompt: String,
}

pub fn run() {
    let config = Config::builder()
        .history_ignore_space(true)
        .completion_type(CompletionType::List)
        .output_stream(OutputStreamType::Stdout)
        .build();

    let h = MyHelper {
        completer: get_command_completer(),
        highlighter: MatchingBracketHighlighter::new(),
        hinter: HistoryHinter {},
        colored_prompt: "".to_owned(),
        validator: MatchingBracketValidator::new(),
    };

    let mut rl = Editor::with_config(config);
    // let mut rl = Editor::<()>::new();
    rl.set_helper(Some(h));

    ......

}
```

首先定义 MyHelper 结构体， 需要实现 Completer + Hinter + Highlighter + Validator trait。然后通过rustyline的set_helper函数加载我们定义好的helper。在MyHelper 结构体中，需要我们自己来实现completer的逻辑。

## Sub command autocompleter实现详解

- SubCmd 结构体

  ```
  #[derive(Debug, Clone)]
  pub struct SubCmd {
      pub level: usize,
      pub command_name: String,
      pub subcommands: Vec<String>,
  }
  ```

- SubCmd 结构体包含，命令级别，命令名称，以及该命令包含的子命令信息，以便在实现实现 autocomplete 时定位命令和子命令的范围

- 在程序启动时遍历所有的command，src/cmd/rootcmd.rs 中的all_subcommand函数负责收集所有命令并转换为Vec

  ```
  pub fn all_subcommand(app: &clap_Command, beginlevel: usize, input: &mut Vec<SubCmd>) {
    let nextlevel = beginlevel + 1;
    let mut subcmds = vec![];
    for iterm in app.get_subcommands() {
        subcmds.push(iterm.get_name().to_string());
        if iterm.has_subcommands() {
            all_subcommand(iterm, nextlevel, input);
        } else {
            if beginlevel == 0 {
                all_subcommand(iterm, nextlevel, input);
            }
        }
    }
    let subcommand = SubCmd {
        level: beginlevel,
        command_name: app.get_name().to_string(),
        subcommands: subcmds,
    };
    input.push(subcommand);
  }
  ```

- CommandCompleter 子命令自动补充功能的核心部分

  ```
  #[derive(Debug, Clone)]
  pub struct CommandCompleter {
      subcommands: Vec<SubCmd>,
  }
  
  impl CommandCompleter {
      pub fn new(subcmds: Vec<SubCmd>) -> Self {
          Self {
              subcommands: subcmds,
          }
      }
  
      //获取level下所有可能的子命令
      pub fn level_possible_cmd(&self, level: usize) ->   Vec<String> {
          let mut subcmds = vec![];
          let cmds = self.subcommands.clone();
          for iterm in cmds {
              if iterm.level == level {
                  subcmds.push(iterm.command_name.clone());
              }
          }
          return subcmds;
      }
      //获取level下某字符串开头的子命令
      pub fn level_prefix_possible_cmd(&self, level: usize,   prefix: &str) -> Vec<String> {
          let mut subcmds = vec![];
          let cmds = self.subcommands.clone();
          for iterm in cmds {
              if iterm.level == level && iterm.command_name.  starts_with(prefix) {
                  subcmds.push(iterm.command_name);
              }
          }
          return subcmds;
      }
  
      //获取某level 下某subcommand的所有子命令
      pub fn level_cmd_possible_sub_cmd(&self, level:   usize, cmd: String) -> Vec<String> {
          let mut subcmds = vec![];
          let cmds = self.subcommands.clone();
          for iterm in cmds {
              if iterm.level == level && iterm.command_name   == cmd {
                  subcmds = iterm.subcommands.clone();
              }
          }
          return subcmds;
      }
  
      //获取某level 下某subcommand的所有prefix子命令
      pub fn level_cmd_possible_prefix_sub_cmd(
          &self,
          level: usize,
          cmd: String,
          prefix: &str,
      ) -> Vec<String> {
          let mut subcmds = vec![];
          let cmds = self.subcommands.clone();
          for iterm in cmds {
              if iterm.level == level && iterm.command_name   == cmd {
                  for i in iterm.subcommands {
                      if i.starts_with(prefix) {
                          subcmds.push(i);
                      }
                  }
              }
          }
          return subcmds;
      }
  
      pub fn complete_cmd(&self, line: &str, pos: usize) ->   Result<(usize, Vec<Pair>)> {
          let mut entries: Vec<Pair> = Vec::new();
          let d: Vec<_> = line.split(' ').collect();
  
          if d.len() == 1 {
              if d.last() == Some(&"") {
                  for str in self.level_possible_cmd(1) {
                      let mut replace = str.clone();
                      replace.push_str(" ");
                      entries.push(Pair {
                          display: str.clone(),
                          replacement: replace,
                      });
                  }
                  return Ok((pos, entries));
              }
  
              if let Some(last) = d.last() {
                  for str in self.level_prefix_possible_cmd  (1, *last) {
                      let mut replace = str.clone();
                      replace.push_str(" ");
                      entries.push(Pair {
                          display: str.clone(),
                          replacement: replace,
                      });
                  }
                  return Ok((pos - last.len(), entries));
              }
          }
  
          if d.last() == Some(&"") {
              for str in self
                  .level_cmd_possible_sub_cmd(d.len() - 1,   d.get(d.len() - 2).unwrap().to_string())
              {
                  let mut replace = str.clone();
                  replace.push_str(" ");
                  entries.push(Pair {
                      display: str.clone(),
                      replacement: replace,
                  });
              }
              return Ok((pos, entries));
          }
  
          if let Some(last) = d.last() {
              for str in self.  level_cmd_possible_prefix_sub_cmd(
                  d.len() - 1,
                  d.get(d.len() - 2).unwrap().to_string(),
                  *last,
              ) {
                  let mut replace = str.clone();
                  replace.push_str(" ");
                  entries.push(Pair {
                      display: str.clone(),
                      replacement: replace,
                  });
              }
              return Ok((pos - last.len(), entries));
          }
  
          Ok((pos, entries))
      }
  }
  
  impl Completer for CommandCompleter {
      type Candidate = Pair;
  
      fn complete(&self, line: &str, pos: usize, _ctx: &  Context<'_>) -> Result<(usize, Vec<Pair>)> {
          self.complete_cmd(line, pos)
      }
  }
  ```

- CommandCompleter 的实现部分比较多，大致包括两个部分，前一部分包括：获取某一级别下所有可能的子命令、获取某级别下某字符串开头的子命令、获取某级别下某个命令的所有子命令，等基本功能。这部分代码中有注释就不一一累述。函数complete_cmd用来计算行中的位置以及在该位置的替换内容。输入项是命令行的内容以及光标所在位置，输出项为在该位置需要替换的内容。比如，我们在提示符下输入 "root cm" root 下包含 cmd1、cmd2 两个子命令，此时如果按 'tab'键，complete_cmd 函数就会返回 (7,[cmd1,cmd2])。