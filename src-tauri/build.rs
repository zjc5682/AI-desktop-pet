/*
  build.rs - Tauri构建脚本
  功能：在编译时执行构建任务，如生成资源文件或配置平台特定设置
*/

/*
  主函数
  Cargo在构建时自动调用此函数
*/
fn main() {
    /*
      执行Tauri构建过程
      处理资源嵌入、图标生成等Tauri特定构建任务
    */
    tauri_build::build()
}
