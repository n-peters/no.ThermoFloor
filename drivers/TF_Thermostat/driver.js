'use strict';

const path = require('path');
const ZwaveDriver = require('homey-zwavedriver');

// http://products.z-wavealliance.org/products/1584

module.exports = new ZwaveDriver(path.basename(__dirname), {
	debug: true,
	capabilities: {
		measure_temperature: {
			command_class: 'COMMAND_CLASS_SENSOR_MULTILEVEL',
			command_get: 'SENSOR_MULTILEVEL_GET',
			command_report: 'SENSOR_MULTILEVEL_REPORT',
			command_report_parser: report => {
				if (!report) return null;
				if (report['Sensor Type'] === 'Temperature (version 1)') return report['Sensor Value (Parsed)'];
				return null;
			},
		},
		target_temperature: {
			command_class: 'COMMAND_CLASS_THERMOSTAT_SETPOINT',
			command_get: 'THERMOSTAT_SETPOINT_GET',
			command_get_parser: node => {
				let mode = 'Heating 1';
				if (node && typeof node.state.eurotronic_mode !== 'undefined' && node.state.eurotronic_mode === 'Energy Save Heat') {
					mode = 'Energy Save Heating 2';
				}
				return {
					Level: {
						'Setpoint Type': mode,
					},
				};
			},
			command_set: 'THERMOSTAT_SETPOINT_SET',
			command_set_parser: value => {
				// Create 2 byte buffer of value, with value rounded to xx.5
				if (!value) value = 18;
				let newTemp = new Buffer(2);
				newTemp.writeUIntBE((value * 2).toFixed() / 2 * 10, 0, 2);

				return {
					Level: {
						'Setpoint Type': 'Heating 1'
					},
					Level2: {
						Precision: 1, // Number has one decimal
						Scale: 0, // No scale used
						Size: 2, // Value = 2 Bytes
					},
					Value: newTemp,
				};
			},
			command_report: 'THERMOSTAT_SETPOINT_REPORT',
			command_report_parser: report => {
				if (report &&
					report.hasOwnProperty('Value') &&
					report.hasOwnProperty('Level2') &&
					typeof report.Level2.Precision === 'number' &&
					typeof report.Level2.Size === 'number') {

					let targetValue;
					try {
						targetValue = report.Value.readUIntBE(0, report.Level2.Size);
					}
					catch (err) {
						return null;
					}
					if (typeof targetValue === 'number') return targetValue / Math.pow(10, report.Level2.Precision);
					return null;
				}
				return null;
			},
		},
		thermofloor_mode: {
			command_class: 'COMMAND_CLASS_THERMOSTAT_MODE',
			command_get: 'THERMOSTAT_MODE_GET',
			command_set: 'THERMOSTAT_MODE_SET',
			command_set_parser: value => ({
				Level: {
					'No of Manufacturer Data fields': 0,
					Mode: value,
				},
				'Manufacturer Data': new Buffer([0]),
			}),
			command_report: 'THERMOSTAT_MODE_REPORT',
			command_report_parser: (report, node) => {
				if (!report) return null;
				if (report.hasOwnProperty('Level') && report.Level.hasOwnProperty('Mode')) {
					if (node) {
						Homey.manager('flow').triggerDevice('thermofloor_mode_changed', {
							mode: report.Level.Mode,
							mode_name: __("mode." + report.Level.Mode)
						}, null, node.device_data);
						Homey.manager('flow').triggerDevice('thermofloor_mode_changed_to', null, {
							mode: report.Level.Mode
						}, node.device_data);
					}
					return report.Level.Mode;
				}
				return null;
			},
		}
	},
	settings: {
		operation_mode: {
			index: 1,
			size: 2,
		},
		temp_sensor: {
			index: 2,
			size: 2,
		},
		floor_sensor: {
			index: 3,
			size: 2,
		},
		temperature_control_hysteresis: {
			index: 4,
			size: 2,
		},
		FLO_floor_min: {
			index: 5,
			size: 2,
		},
		FHI_floor_max: {
			index: 6,
			size: 2,
		},
		ALO_air_min: {
			index: 7,
			size: 2,
		},
		AHI_air_max: {
			index: 8,
			size: 2,
		},
		PLO_temp_min: {
			index: 9,
			size: 2,
		},
		CO_setpoint: {
			index: 10,
			size: 2,
		},
		ECO_setpoint: {
			index: 11,
			size: 2,
		},
		P_setting: {
			index: 12,
			size: 2,
		},
		COOL_setpoint: {
			index: 13,
			size: 2,
		},
	},
});

Homey.manager('flow').on('trigger.thermofloor_mode_changed_to', (callback, args, state) => {
	if (!args) return callback('arguments_error', false);
	else if (!state) return callback('state_error', false);

	else if (typeof args.mode !== 'undefined' && typeof state.mode !== 'undefined' && args.mode === state.mode) return callback(null, true);
	else return callback('unknown_error', false);
});
