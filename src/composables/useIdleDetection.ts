/**
 * ========================================
 * useIdleDetection.ts - 空闲和睡眠状态检测
 * ========================================
 * 功能：检测用户长时间无操作，自动进入空闲/睡眠状态
 * 
 * 工作原理：
 * 1. 记录最后一次交互时间戳
 * 2. 启动双层定时器：
 *    - 第一层（idleDelay=5 秒）：触发空闲提醒
 *    - 第二层（sleepDelay=30 秒）：触发睡眠状态
 * 3. 任何交互都会重置所有定时器
 * 
 * @param onIdle - 空闲时的回调函数
 * @param onSleep - 睡眠时的回调函数
 * @param idleDelay - 空闲延迟时间（毫秒），默认 5000ms
 * @param sleepDelay - 睡眠延迟时间（毫秒），默认 30000ms
 */

import { ref, watch } from 'vue';  // Vue 响应式 API

export function useIdleDetection(
  onIdle: () => void,   // 空闲回调：显示无聊消息
  onSleep: () => void,  // 睡眠回调：播放睡眠动画
  idleDelay: number = 5000,   // 空闲延迟：5 秒
  sleepDelay: number = 30000  // 睡眠延迟：30 秒
) {
  // 最后交互时间（响应式引用）
  const lastInteractionTime = ref(Date.now());
  // 是否处于睡眠状态（响应式引用）
  const isSleeping = ref(false);
  
  // 空闲检测定时器 ID
  let idleTimer: number | null = null;
  // 睡眠超时定时器 ID
  let sleepTimeout: number | null = null;

  /**
   * 重置空闲计时器
   * 每次用户交互时调用，重新开始计时
   */
  const resetIdleTimer = () => {
    lastInteractionTime.value = Date.now();  // 更新最后交互时间
    isSleeping.value = false;                // 唤醒状态
    
    // 清除之前的定时器，防止重复触发
    if (idleTimer) clearTimeout(idleTimer);
    if (sleepTimeout) clearTimeout(sleepTimeout);
    
    // === 第一阶段：空闲检测 ===
    idleTimer = window.setTimeout(() => {
      if (!isSleeping.value) {
        onIdle();  // 触发空闲回调（显示无聊消息）
      }
      
      // === 第二阶段：睡眠检测 ===
      sleepTimeout = window.setTimeout(() => {
        if (!isSleeping.value) {
          isSleeping.value = true;  // 标记为睡眠状态
          onSleep();                // 触发睡眠回调（播放睡眠动画）
        }
      }, sleepDelay);  // 30 秒后进入睡眠
    }, idleDelay);  // 5 秒后触发空闲
  };

  /**
   * 启动空闲检测
   * 在模型加载完成后调用一次
   */
  const startIdleDetection = () => {
    // 清除旧定时器（如果有）
    if (idleTimer) clearTimeout(idleTimer);
    if (sleepTimeout) clearTimeout(sleepTimeout);
    
    resetIdleTimer();  // 启动新的检测循环
  };

  /**
   * 切换睡眠/唤醒状态
   * 用户手动点击睡眠按钮时调用
   */
  const toggleSleep = () => {
    isSleeping.value = !isSleeping.value;  // 切换状态
    if (!isSleeping.value) {
      resetIdleTimer();  // 如果是唤醒，重置定时器
    }
  };

  /**
   * 强制唤醒
   * 立即唤醒角色并重置定时器
   */
  const wakeUp = () => {
    isSleeping.value = false;  // 设置为唤醒状态
    resetIdleTimer();          // 重置定时器
  };

  // 监听最后交互时间变化，自动重置定时器
  watch(lastInteractionTime, () => {
    resetIdleTimer();
  });

  /**
   * 清理函数：组件卸载时调用
   * 清除所有定时器，防止内存泄漏
   */
  const cleanup = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (sleepTimeout) clearTimeout(sleepTimeout);
  };

  // 返回公共 API 给调用方使用
  return {
    isSleeping,            // 睡眠状态（响应式）
    lastInteractionTime,   // 最后交互时间（响应式）
    startIdleDetection,    // 启动检测
    resetIdleTimer,        // 重置定时器
    toggleSleep,           // 切换睡眠
    wakeUp,                // 唤醒
    cleanup                // 清理资源
  };
}
