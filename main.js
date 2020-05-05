/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';

// you have to require the utils module and call adapter function
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const adapter = new utils.Adapter('mihome-plug');
const dgram   = require('dgram');
const MiHome  = require('./lib/mihomepacket');

const server  = dgram.createSocket('udp4');

let connected = false;
let commands  = {};
let paramReq  = null;
let pingInterval;
let message = '';
let packet;

// is called if a subscribed state changes
adapter.on('stateChange', (id, state) => {
    if (!state || state.ack) return;
    //test
    // Warning, state can be null if it was deleted
    adapter.log.debug('stateChange ' + id + ' ' + JSON.stringify(state));

    // output to parser
    const command = id.split('.').pop();
    if (command === 'power' || command === 'wifi_led') {
        let send;

        switch (command) {
            case 'power':
                send = 'set_power';
                break;

            case 'wifi_led':
                send = 'set_wifi_led';
                break;

            default:
                adapter.log.error('state not found');
        }

        if (state.val === 'true' || state.val === true || state.val === '1' || state.val === 1 || state.val === 'on' || state.val === 'ON') {
            sendCommand(commands[send] + '"on"]', () =>
                adapter.setForeignState(adapter.namespace + '.' + command, true, true));
        } else {
            sendCommand(commands[send] + '"off"]', () =>
                adapter.setForeignState(adapter.namespace + '.' + +command, false, true));
        }
    }
});

adapter.on('unload', callback => {
    if (pingTimeout) clearTimeout(pingTimeout);
    adapter.setState('info.connection', false, true);
    if (pingInterval) clearInterval(pingInterval);
    if (typeof callback === 'function') callback();
});


adapter.on('ready', main);

let pingTimeout = null;

function sendPing() {
    pingTimeout = setTimeout(() => {
        pingTimeout = null;
        if (connected) {
            connected = false;
            adapter.log.info('Disconnect');
            adapter.setState('info.connection', false, true);
        }
    }, 3000);

    try {
        if (packet.token.toString('hex') !== 'ffffffffffffffffffffffffffffffff') {
            packet.msgCounter = 400;
            message = commands.get_prop;
        } else {
            adapter.log.warn('Token is not found yet!');
        }

        server.send(commands.ping, 0, commands.ping.length, adapter.config.port, adapter.config.ip, err =>
            err && adapter.log.error('Cannot send ping: ' + err));
    } catch (e) {
        adapter.log.warn('Cannot send ping: ' + e);
        clearTimeout(pingTimeout);
        pingTimeout = null;
        if (connected) {
            connected = false;
            adapter.log.info('Disconnect');
            adapter.setState('info.connection', false, true);
        }
    }
}

function str2hex(str) {
    str = str.replace(/\s/g, '');
    const buf = new Buffer(str.length / 2);

    for (let i = 0; i < str.length / 2; i++) {
        buf[i] = parseInt(str[i * 2] + str[i * 2 + 1], 16);
    }
    return buf;
}

function sendCommand(cmd, callback) {
    try {
        message = cmd;
        packet.setHelo();
        const cmdRaw = packet.getRaw();
        adapter.log.info('Send >>> Helo >>> ' + cmdRaw.toString('hex'));
        server.send(cmdRaw, 0, cmdRaw.length, adapter.config.port, adapter.config.ip, err => {
            if (err) adapter.log.error('Cannot send command: ' + err);
            if (typeof callback === 'function') callback(err);
        });
    } catch (err) {
        adapter.log.warn('Cannot send command_: ' + err);
        if (typeof callback === 'function') callback(err);
    }
}

function getStates(message) {
    // Search id in answer
    const answer  = JSON.parse(message);
    const request = Object.assign({}, paramReq);
    adapter.log.debug(answer.result.length);

    if (answer.id === 400) {
        for (let i = 0; i < answer.result.length; i++) {
            if (request.params[i] === 'temperature'        ||
                request.params[i] === 'power_consume_rate' ||
                request.params[i] === 'power_price'        ||
                request.params[i] === 'lp_autooff'         ||
                request.params[i] === 'lp_threshold'       ||
                request.params[i] === 'lp_autooff_delay') {
                adapter.setState(request.params[i], answer.result[i], true);
                adapter.log.debug('Value "' + answer.result[i] + '" in: "' + request.params[i] + '" stored');
            } else {
                adapter.log.debug('Value "' + (answer.result[i] === 'on') + '" in: "' + request.params[i] + '" stored');
                adapter.setState(request.params[i], answer.result[i] === 'on', true);
            }
        }
    }
}

function main() {
    adapter.setState('info.connection', false, true);
    adapter.config.port         = parseInt(adapter.config.port, 10)         || 54321;
    adapter.config.ownPort      = parseInt(adapter.config.ownPort, 10)      || 53421;
    adapter.config.pingInterval = parseInt(adapter.config.pingInterval, 10) || 20000;

    if (!adapter.config.ip || adapter.config.ip === '0.0.0.0') {
        adapter.log.error('No IP set');
        return;
    }

    packet = new MiHome.Packet();

    packet.msgCounter = 1;

    commands = {
        ping: str2hex('21310020ffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
        get_prop:     '"method":"get_prop","params":["power","temperature","wifi_led"]',
        set_power:    '"method":"set_power","params":[',
        set_wifi_led: '"method":"set_wifi_led","params":['
    };

    paramReq = {
        id: 400,
        method: 'get_prop',
        params: [
            "power",
            "temperature",
//            "power_consume_rate",
//            "power_price",
            "wifi_led"
//            "option_feature",
//            "lp_autooff",
//            "lp_threshold",
//            "lp_autooff_delay"
        ]
    };

    server.on('error', err => {
        adapter.log.error('UDP error: ' + err);
        server.close();
        process.exit();
    });

    server.on('message', (msg, rinfo) => {
        if (rinfo.port === adapter.config.port) {
            if (msg.length === 32) {
                adapter.log.debug('Receive <<< Helo <<< ' + msg.toString('hex'));
                packet.setRaw(msg);
                adapter.log.debug('Token  =  ' + packet.token.toString('hex'));
                adapter.log.debug('lenght =  ' + packet.len.toString('hex'));
                adapter.log.debug('data   =  ' + packet.data.toString('hex'));
                adapter.log.debug('check  =  ' + packet.checksum.toString('hex'));
                clearTimeout(pingTimeout);
                pingTimeout = null;
                if (!connected) {
                    connected = true;
                    adapter.log.info('Connected');
                    adapter.setState('info.connection', true, true);
                }

                if (message.length > 0) {
                    try {
                        packet.setPlainData('{"id":' + packet.msgCounter + ',' + message + '}');
                        adapter.log.debug('{"id":' + packet.msgCounter + ',' + message + '}');

                        const cmdRaw = packet.getRaw();
                        adapter.log.debug('Send >>> {"id":' + packet.msgCounter + ',' + message + "} >>> " + cmdRaw.toString('hex'));
                        adapter.log.debug(cmdRaw.toString('hex'));
                        message = '';
                        server.send(cmdRaw, 0, cmdRaw.length, adapter.config.port, adapter.config.ip, function (err) {
                            if (err) adapter.log.error('Cannot send command: ' + err);
                        });
                        packet.msgCounter++;
                        if (packet.msgCounter > 0xFFFFFF) packet.msgCounter = 1;
                    } catch (err) {
                        adapter.log.warn('Cannot send command_: ' + err);
                    }
                }
            } else {
                // here decode the answer
                packet.setRaw(msg);
                adapter.log.debug('Receive <<< ' + packet.getPlainData() + '<<< ' + msg.toString('hex'));
                //adapter.log.warn('server got: ' + msg.length + ' bytes from ' + rinfo.address + ':' + rinfo.port);
                getStates(packet.getPlainData());
            }
        }
    });

    server.on('listening', () => {
        const address = server.address();
        adapter.log.debug('server started on ' + address.address + ':' + address.port);
    });

    try {
        server.bind(adapter.config.ownPort);
    } catch (e) {
        adapter.log.error('Cannot open UDP port: ' + e);
        return;
    }

    sendPing();
    pingInterval = setInterval(sendPing, adapter.config.pingInterval);
    adapter.subscribeStates('*');
}
