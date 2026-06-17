type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

interface LogPayload {
  eventId: string;
  [key: string]: any;
}

class StructuredLogger {
  private formatLog(level: LogLevel, eventId: string, payload?: Record<string, any>, error?: Error) {
    const logObject = {
      timestamp: new Date().toISOString(),
      level,
      eventId,
      payload: payload ?? {},
      ...(error && {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
      }),
    };

    const output = JSON.stringify(logObject);
    if (level === "ERROR") {
      console.error(output);
    } else if (level === "WARN") {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  public info(eventId: string, payload?: Record<string, any>) {
    this.formatLog("INFO", eventId, payload);
  }

  public warn(eventId: string, payload?: Record<string, any>, error?: Error) {
    this.formatLog("WARN", eventId, payload, error);
  }

  public error(eventId: string, payload?: Record<string, any>, error?: Error) {
    this.formatLog("ERROR", eventId, payload, error);
  }

  public debug(eventId: string, payload?: Record<string, any>) {
    if (process.env.NODE_ENV !== "production") {
      this.formatLog("DEBUG", eventId, payload);
    }
  }
}

export const logger = new StructuredLogger();
