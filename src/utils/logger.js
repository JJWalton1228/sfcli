import winston from 'winston';

let logger;

export function getLogger() {
  if (logger) return logger;
  logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}] ${message}`)
    ),
    transports: [new winston.transports.Console({ silent: true })],
  });
  return logger;
}

export function enableVerbose() {
  const l = getLogger();
  l.transports[0].silent = false;
  l.level = 'debug';
}
