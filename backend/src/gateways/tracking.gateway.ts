import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { GarvexTrackingPoint } from '../entities/operations/garvex-tracking-point.entity';

@WebSocketGateway({
  cors: {
    origin: '*', // Adjust for production
  },
})
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TrackingGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Example method to broadcast tracking updates
  broadcastTrackingUpdate(units: Array<Omit<GarvexTrackingPoint, 'id' | 'created_at' | 'updated_at'>>) {
    // Only broadcast if there are connected clients
    if (this.server.sockets.sockets.size > 0) {
      this.server.emit('tracking_update', units);
      this.logger.debug(`Broadcasted tracking update for ${units.length} units to ${this.server.sockets.sockets.size} clients`);
    }
  }

  // Optionally, clients can subscribe to specific events
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    return { event: 'pong', data: 'Server is alive' };
  }
}
