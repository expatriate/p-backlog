import net from "node:net";

const GUARDED_PORT_ENV = "P_BACKLOG_GUARDED_PORT";
const ALREADY_GUARDED = Symbol.for("p-backlog.port-guard");

if (!process.env[GUARDED_PORT_ENV]) throw new Error(`${GUARDED_PORT_ENV} не задан: охранник не знает порт живой службы p-backlog, его задаёт tests/port-guard-config.ts`);

function portIn(args) {
  // net.connect() and http hand Socket.prototype.connect their arguments pre-normalized as [options, callback].
  const [target] = args.flat();
  return Number(target?.port ?? target);
}

function refusingGuardedPort(method) {
  return function (...args) {
    const port = portIn(args);
    if (port === Number(process.env[GUARDED_PORT_ENV])) {
      throw new Error(`Тест обратился к порту ${port}: это порт живой службы p-backlog с настоящим беклогом. Возьмите freePort() из src/cli/testing/free-port.ts или порт 0.`);
    }
    return method.apply(this, args);
  };
}

// Vitest starts workers with test.env, so NODE_OPTIONS loads this file natively before setupFiles loads it again.
if (!net.Server.prototype[ALREADY_GUARDED]) {
  net.Server.prototype[ALREADY_GUARDED] = true;
  net.Server.prototype.listen = refusingGuardedPort(net.Server.prototype.listen);
  net.Socket.prototype.connect = refusingGuardedPort(net.Socket.prototype.connect);
}
