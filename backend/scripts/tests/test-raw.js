const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { AzsFuelService } = require('./dist/modules/azs-fuel.service');
const fs = require('fs');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(AzsFuelService);
  const config = service.getConfig();
  const ctx = await service.loadAzsObjectKindContext(config);
  
  const start = new Date('2026-07-05T19:00:00.000Z');
  const end = new Date('2026-07-06T18:59:59.999Z');
  
  const events = await service.fetchEventsInRange(config, ctx.token, start, end);
  fs.writeFileSync('backend/raw_events.json', JSON.stringify(events, null, 2));
  console.log('Saved raw events:', events.length);
  await app.close();
}
bootstrap();
