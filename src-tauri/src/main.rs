/*
  main.rs - Tauri应用Rust入口文件
  功能：启动Tauri桌面应用程序
*/

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
/*
  编译属性：防止在Windows发布版本中显示额外的控制台窗口
  - #![cfg_attr(...)]: 条件编译属性
  - not(debug_assertions): 仅在非调试构建时应用
  - windows_subsystem = "windows": 使用Windows子系统，隐藏控制台
*/
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/*
  主函数：应用程序的入口点
  在Rust中，main函数是程序开始执行的地方
*/
fn main() {
    /*
      调用my_desktop_pet_lib库的run函数
      这个函数会：
      1. 初始化Tauri运行时
      2. 创建应用窗口
      3. 设置系统托盘（如果有）
      4. 启动事件循环
    */
    my_desktop_pet_lib::run()
}
