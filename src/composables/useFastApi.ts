/**
 * useFastApi.ts - FastAPI 后端通信 Hook
 * 提供与 Python 后端的所有 API 交互
 */

import { ref } from 'vue'

const API_BASE_URL = 'http://127.0.0.1:8765/api'

export function useFastApi() {
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  /**
   * 通用请求包装器，处理加载状态和错误
   */
  async function request<T>(
    url: string,
    options?: RequestInit
  ): Promise<T | null> {
    isLoading.value = true
    error.value = null
    
    try {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      
      return await response.json()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      console.error('FastAPI request failed:', error.value)
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 获取宠物状态
   */
  async function getPetStatus() {
    return await request<any>('/pet/status')
  }

  /**
   * 喂食宠物
   */
  async function feedPet(foodType: string = 'snack') {
    return await request<any>(`/pet/feed?food_type=${encodeURIComponent(foodType)}`, {
      method: 'POST',
    })
  }

  /**
   * 切换睡眠状态
   */
  async function toggleSleep(action: 'sleep' | 'wake') {
    return await request<any>(`/pet/sleep?action=${action}`, {
      method: 'POST',
    })
  }

  /**
   * 获取宠物消息
   */
  async function getMessage(topic?: string) {
    const url = topic ? `/pet/message?topic=${encodeURIComponent(topic)}` : '/pet/message'
    return await request<any>(url)
  }

  /**
   * 与宠物聊天
   */
  async function chat(message: string) {
    return await request<any>('/chat', {
      method: 'POST',
      body: JSON.stringify({ user_message: message }),
    })
  }

  /**
   * 健康检查
   */
  async function healthCheck() {
    return await request<any>('')
  }

  return {
    // 状态
    isLoading,
    error,
    
    // API 方法
    getPetStatus,
    feedPet,
    toggleSleep,
    getMessage,
    chat,
    healthCheck,
  }
}
