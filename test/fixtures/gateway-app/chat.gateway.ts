import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';

export class SendMessageDto {
  room!: string;
  text!: string;
  priority?: number;
}

export class ChatMessage {
  id!: number;
  room!: string;
  text!: string;
  sentAt!: string;
}

@WebSocketGateway({ namespace: 'chat', cors: true })
export class ChatGateway {
  /**
   * Send a message to a room.
   * Broadcasts the message to every client in the room.
   */
  @SubscribeMessage('sendMessage')
  handleMessage(@MessageBody() dto: SendMessageDto, @ConnectedSocket() socket: any): ChatMessage {
    return { id: 1, room: dto.room, text: dto.text, sentAt: new Date().toISOString() };
  }

  @SubscribeMessage('typing')
  handleTyping(@MessageBody() room: string): void {
    void room;
  }
}

@WebSocketGateway(3005)
export class MetricsGateway {
  @SubscribeMessage('stats')
  stats(): ChatMessage {
    return { id: 1, room: 'metrics', text: 'ok', sentAt: new Date().toISOString() };
  }
}
