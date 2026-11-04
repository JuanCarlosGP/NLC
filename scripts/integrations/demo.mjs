import { normalizeWhoop, normalizeMercury } from './providers.mjs';
export function demoSnapshot(provider, now = new Date().toISOString()) {
  const today = now.slice(0,10); const days = Array.from({length: 21}, (_, i) => new Date(Date.parse(`${today}T12:00:00Z`) - i * 86400000).toISOString().slice(0,10));
  if (provider === 'whoop') return normalizeWhoop({ profile: { user_id: 999999, first_name: 'Ejemplo', last_name: 'WHOOP' }, body: { weight_kilogram: 76.8, height_meter: 1.78, max_heart_rate: 192 },
    cycles: days.map((day,i) => ({ id: i+1, start: `${day}T06:30:00Z`, timezone_offset: '+01:00', score_state:'SCORED', score: { strain: 8 + i%8, kilojoule: 8000 + i*50 } })),
    recoveries: days.map((_,i) => ({ cycle_id: i+1, sleep_id: `sleep-${i}`, score_state: 'SCORED', score: { recovery_score: 80-i%5*10, resting_heart_rate: 53+i%4, hrv_rmssd_milli: 65-i%7, spo2_percentage: 97.2, skin_temp_celsius: 33.2 } })),
    sleeps: days.map((day,i) => ({ id: `sleep-${i}`, start: new Date(Date.parse(`${day}T06:30:00Z`) - 8*3600000).toISOString(), end:`${day}T06:30:00Z`, timezone_offset:'+01:00', nap:false, score_state:'SCORED', score:{ sleep_performance_percentage:91-i%8, sleep_efficiency_percentage:95, respiratory_rate:15.4, stage_summary: { total_light_sleep_time_milli:220*60000,total_slow_wave_sleep_time_milli:90*60000,total_rem_sleep_time_milli:110*60000,total_awake_time_milli:60*60000 } } })),
    workouts: days.filter((_,i) => i%2 === 0).map((day,i) => ({ id:`activity-${i}`, start:`${day}T17:00:00Z`,end:`${day}T17:45:00Z`,timezone_offset:'+01:00',sport_name:i%2?'Running':'Cycling',score_state:'SCORED',score:{strain:12+i%3,kilojoule:1800,average_heart_rate:139,max_heart_rate:174,distance_meter:8000,zone_durations:{zone_zero_milli:0,zone_one_milli:5*60000,zone_two_milli:20*60000,zone_three_milli:15*60000,zone_four_milli:5*60000,zone_five_milli:0}} }))
  },now,'demo');
  return normalizeMercury({accounts:[{id:'demo-checking',name:'Checking',currentBalance:8234.5,availableBalance:8100,accountNumber:'00001234',status:'active'}],credit:[{id:'demo-credit',currentBalance:-420,availableBalance:-500,status:'active'}],
    treasury:[{id:'demo-treasury',currentBalance:15000,availableBalance:15000,status:'active',netReturns:[{month:`${today.slice(0,7)}-01`,netAmount:42.5,treasuryFee:2,status:'charged'}]}],categories:[{id:'software',name:'Software'}],
    transactions:days.map((day,i)=>({id:`demo-tx-${i}`,accountId:'demo-checking',amount:i%4===0?1200:-29-i,status:i===0?'pending':'sent',createdAt:`${day}T10:00:00Z`,postedAt:i===0?null:`${day}T12:00:00Z`,counterpartyName:i%4===0?'Cliente de ejemplo':'Servicio de ejemplo',categoryData:{id:'software'}})),
    treasuryTransactions:[{id:'demo-treasury-tx',accountId:'demo-treasury',amount:42.5,canonicalDay:today,description:'Dividendo de ejemplo',status:'sent'}]
  },now,'demo');
}
