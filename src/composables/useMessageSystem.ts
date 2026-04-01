/**
 * ========================================
 * useMessageSystem.ts - 消息系统
 * ========================================
 * 功能：管理所有对话气泡和提示信息
 * 
 * 特性：
 * 1. 预设多种场景的对话文本（鼠标悬停、点击、空闲等）
 * 2. 支持随机显示对话
 * 3. 自动定时隐藏消息
 * 4. 响应式状态管理
 */

import { ref } from 'vue';  // Vue 响应式 API

export function useMessageSystem() {
  // 是否显示消息（响应式）
  const showMessage = ref(false);
  // 当前消息文本（响应式）
  const messageText = ref('');
  
  // === 预设对话文本库 ===
  const messages = {
    // 鼠标悬停时的对话
    mouseover: {
      head: ['不要摸我的头啦~', '头发要被弄乱了!', '嘻嘻，好痒~'],  // 头部悬停
      body: ['不要动手动脚的!', '这样不太好吧~', '哼!']            // 身体悬停
    },
    // 点击时的对话
    click: {
      head: ['哎呀!', '很痒的!', '别闹了啦~'],  // 点击头部
      body: ['呀!', '你在做什么!', '真是的...']  // 点击身体
    },
    // 特殊状态对话
    idle: ['好无聊啊~', '有人吗？', '发呆中...'],        // 空闲时
    sleepy: ['呼...呼...', '晚安...', '做个好梦...'],    // 睡眠时
    wakeUp: ['我醒了~', '有什么事吗？', '睡得好舒服!']   // 唤醒时
  };

  /**
   * 显示指定消息
   * @param text - 要显示的文本
   * @param duration - 显示时长（毫秒），默认 3000ms
   */
  const show = (text: string, duration: number = 3000) => {
    messageText.value = text;     // 设置消息文本
    showMessage.value = true;     // 显示消息框
    
    // 定时自动隐藏
    setTimeout(() => {
      showMessage.value = false;
    }, duration);  // 默认 3 秒后消失
  };

  /**
   * 随机显示消息
   * 从给定的消息数组中随机选择一条显示
   * @param msgs - 消息数组
   */
  const showRandom = (msgs: string[]) => {
    if (msgs.length === 0) return;
    // 随机选择一个索引
    const index = Math.floor(Math.random() * msgs.length);
    show(msgs[index]);  // 显示选中的消息
  };

  /**
   * 立即隐藏消息
   */
  const hide = () => {
    showMessage.value = false;
  };

  // 返回公共 API
  return {
    showMessage,     // 显示状态（响应式）
    messageText,     // 消息文本（响应式）
    messages,        // 预设消息库
    show,            // 显示指定消息
    showRandom,      // 随机显示消息
    hide             // 隐藏消息
  };
}
