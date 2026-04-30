const SPREADSHEET_ID_MAIN = '1oZMWwvTHATw4Eoehm6URoysFwp3ylm8Bb0udy-qG1zg';
const SHEET_NAME_MAIN = 'مبيعات';
const SPREADSHEET_ID_DONE = '1HcnGcO9hcYWPNRETHGzdN1-XwTgpvc6YZhPyw4zRssI';
const SHEET_NAME_DONE = 'بيدار (نتائج معاينة)';
const API_KEY = 'AIzaSyCkoMx_6tPVCPpnnBCzoQjNYovnVaRgjbM';

function normalizeArabicDigits(str) {
    return str.replace(/[٠-٩]/g, d => String.fromCharCode(d.charCodeAt(0) - 1632 + 48));
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    let s = dateStr.toString().trim();
    if (s === 'FALSE' || s === 'TRUE' || s === '') return null;
    s = normalizeArabicDigits(s);
    s = s.replace(/[^\d\/\.\-\s]/g, '').trim();
    let match = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!match) match = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (!match) match = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
        let day, month, year;
        if (match[1].length === 4) {
            year = parseInt(match[1]); month = parseInt(match[2]) - 1; day = parseInt(match[3]);
        } else {
            let part1 = parseInt(match[1]), part2 = parseInt(match[2]), part3 = parseInt(match[3]);
            if (match[3].length <= 2 && part3 < 100) { year = 2000 + part3; month = part2 - 1; day = part1; }
            else if (part1 >= 1000) { year = part1; month = part2 - 1; day = part3; }
            else { day = part1; month = part2 - 1; year = part3; }
        }
        let d = new Date(year, month, day, 12, 0);
        return !isNaN(d.getTime()) ? d : null;
    }
    let timestamp = Date.parse(s);
    if (!isNaN(timestamp)) {
        let d = new Date(timestamp);
        return d.getFullYear() > 2000 ? d : null;
    }
    return null;
}

function parseTime(timeStr) {
    if (!timeStr) return { hour: 12, minute: 0 };
    let s = timeStr.toString().trim();
    if (s === 'FALSE' || s === 'TRUE' || s === '') return { hour: 12, minute: 0 };
    let match = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([مص])/);
    if (match) {
        let hour = parseInt(match[1]), minute = parseInt(match[2]), period = match[3];
        let hour24 = period === 'م' ? (hour === 12 ? 12 : hour+12) : (hour === 12 ? 0 : hour);
        return { hour: hour24, minute };
    }
    return { hour: 12, minute: 0 };
}

async function fetchMainSheetData() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID_MAIN}/values/${SHEET_NAME_MAIN}!A1:Z2000?key=${API_KEY}`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    const rows = data.values;
    if (!rows || rows.length < 2) return [];
    const events = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i]; if (!row) continue;
        const name = row[1] || 'غير محدد';
        const phone = row[2] || '';
        const city = row[6] || '';
        const address = row[7] || '';
        const notes = row[8] || '';

        const appDate = row[14]; const appTime = row[15] || '';
        if (appDate && appDate !== 'FALSE' && appDate.toString().trim()) {
            const d = parseDate(appDate);
            if (d) {
                const t = parseTime(appTime);
                d.setHours(t.hour, t.minute);
                events.push({ id: `main_app_${i}`, title: name, type: 'معاينة', date: d.getTime(), phone, city, address, notes });
            }
        }
        const cbL = row[11]; const cbLNotes = row[13] || '';
        if (cbL && cbL !== 'FALSE' && cbL.toString().trim()) {
            const d = parseDate(cbL);
            if (d) events.push({ id: `main_cbL_${i}`, title: name, type: 'متابعة مكالمة', date: d.getTime(), phone, city, address, notes: cbLNotes || notes });
        }
        const cbS = row[18]; const cbSNotes = row[20] || '';
        if (cbS && cbS !== 'FALSE' && cbS.toString().trim()) {
            const d = parseDate(cbS);
            if (d) events.push({ id: `main_cbS_${i}`, title: name, type: 'متابعة معاينة', date: d.getTime(), phone, city, address, notes: cbSNotes || notes });
        }
    }
    return events;
}

async function fetchDoneSheetData() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID_DONE}/values/${SHEET_NAME_DONE}!A1:Z2000?key=${API_KEY}`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    const rows = data.values;
    if (!rows || rows.length < 2) return [];
    const events = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i]; if (!row) continue;
        const name = row[1] || 'غير محدد';
        const phone = row[2] || '';
        const dateStr = row[3];
        if (dateStr && dateStr !== 'FALSE' && dateStr.toString().trim()) {
            const d = parseDate(dateStr);
            if (d) {
                events.push({ id: `done_${i}`, title: name, type: 'معاينة تمت', date: d.getTime(), phone, city: '', address: '', notes: row[5] || '', code: row[0] || '', clientReply: row[4] || '' });
            }
        }
    }
    return events;
}

function getPreviousEvents() {
    return caches.open('events-cache').then(cache => cache.match('previousEvents')).then(resp => resp?.json() || []);
}
function setPreviousEvents(events) {
    caches.open('events-cache').then(cache => cache.put('previousEvents', new Response(JSON.stringify(events))));
}

function makeEventKey(ev) {
    const dateISO = new Date(ev.date).toISOString().slice(0,10);
    return `${ev.type}|${ev.title}|${ev.phone}|${dateISO}|${ev.notes}|${ev.code || ''}`;
}

async function checkAndNotify() {
    try {
        const [mainEvents, doneEvents] = await Promise.all([fetchMainSheetData(), fetchDoneSheetData()]);
        const newEvents = [...mainEvents, ...doneEvents];
        const previousEvents = await getPreviousEvents();
        const now = Date.now();
        const appUrl = self.registration.scope;

        // إشعارات المواعيد القادمة
        const upcoming = newEvents.filter(ev => ev.date > now && ev.date < now + 24*60*60*1000);
        for (const ev of upcoming) {
            const minsLeft = Math.round((ev.date - now) / 60000);
            const timeText = minsLeft < 60 ? `خلال ${minsLeft} دقيقة` : `بعد ${Math.round(minsLeft/60)} ساعات`;
            self.registration.showNotification(`🔔 ${ev.type} قريب`, {
                body: `${ev.title} - ${timeText}`,
                icon: 'https://img.icons8.com/color/96/real-estate.png',
                tag: `upcoming-${ev.id}`,
                data: { url: appUrl, eventId: ev.id }   // أضفنا eventId
            });
        }

        // إشعارات التغييرات
        if (previousEvents.length) {
            const added = newEvents.filter(ev => !previousEvents.some(pe => makeEventKey(pe) === makeEventKey(ev)));
            const removed = previousEvents.filter(pe => !newEvents.some(ev => makeEventKey(ev) === makeEventKey(pe)));
            const updated = newEvents.filter(ev => {
                const oldEv = previousEvents.find(pe => pe.id === ev.id);
                return oldEv && (oldEv.date !== ev.date || oldEv.notes !== ev.notes || oldEv.phone !== ev.phone || oldEv.title !== ev.title);
            });

            for (const ev of added) {
                self.registration.showNotification('📌 موعد جديد', {
                    body: `${ev.title} - ${new Date(ev.date).toLocaleDateString('ar-EG')}`,
                    icon: 'https://img.icons8.com/color/96/real-estate.png',
                    tag: `add-${ev.id}`,
                    data: { url: appUrl, eventId: ev.id }
                });
            }
            for (const ev of removed) {
                self.registration.showNotification('🗑️ تم حذف موعد', {
                    body: `${ev.title} - ${new Date(ev.date).toLocaleDateString('ar-EG')}`,
                    icon: 'https://img.icons8.com/color/96/real-estate.png',
                    tag: `del-${ev.id}`,
                    data: { url: appUrl, eventId: ev.id }
                });
            }
            for (const ev of updated) {
                self.registration.showNotification('✏️ تم تعديل موعد', {
                    body: `${ev.title} - ${new Date(ev.date).toLocaleDateString('ar-EG')}`,
                    icon: 'https://img.icons8.com/color/96/real-estate.png',
                    tag: `edit-${ev.id}`,
                    data: { url: appUrl, eventId: ev.id }
                });
            }
        }

        setPreviousEvents(newEvents);
    } catch (e) {
        console.error('SW checkAndNotify error:', e);
    }
}

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    self.clients.claim();
    checkAndNotify();
    setInterval(checkAndNotify, 60000);
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const data = event.notification.data || {};
    const baseUrl = data.url || self.registration.scope;
    const eventId = data.eventId || '';
    const targetUrl = eventId ? `${baseUrl}#eventId=${eventId}` : baseUrl;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(windowClients => {
                for (let client of windowClients) {
                    if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
                        client.navigate(targetUrl); // تحديث الصفحة الحالية
                        return client.focus();
                    }
                }
                return clients.openWindow(targetUrl);
            })
    );
});
