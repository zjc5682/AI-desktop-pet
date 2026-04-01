export interface ToolContext {
  sessionId?: string;
  userId?: string;
}

export interface ToolResult {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ToolDefinition {
  id: string;
  description: string;
  dangerous?: boolean;
  run(input: unknown, context: ToolContext): Promise<ToolResult>;
}

export interface ToolRegistry {
  register(tool: ToolDefinition): void;
  call(id: string, input: unknown, context: ToolContext): Promise<ToolResult>;
  list(): ToolDefinition[];
}

export class InMemoryToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool);
  }

  async call(id: string, input: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(id);
    if (!tool) {
      throw new Error(`Tool ${id} is not registered.`);
    }
    return tool.run(input, context);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}
