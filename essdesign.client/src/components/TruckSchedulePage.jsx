import React, { useEffect, useMemo, useState } from 'react';
import { materialOrderRequestsAPI } from '../services/api';

const TIME_MARKERS = ['6 AM', '8 AM', '10 AM', '12 PM', '2 PM', '4 PM'];

function todayHeadline() {
  const now = new Date();
  return `Today, ${now.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function minutes(label) {
  const normalized = label.trim().toUpperCase();
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (!match) return 360;
  let hour = Number(match[1]) % 12;
  const minute = Number(match[2] || '0');
  if (match[3] === 'PM') hour += 12;
  return hour * 60 + minute;
}

function flexFor(block) {
  const total = 16 * 60 - 6 * 60;
  return Math.max(30, minutes(block.end) - minutes(block.start)) / total;
}

function laneIndexForRequest(request) {
  const source = request?.id || request?.builderName || request?.projectName || 'request';
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return hash % 3;
}

function buildLaneTemplate(requestsByLane) {
  return [
    {
      id: 'truck-1',
      rego: 'ESS-421',
      truckLabel: '10T Truck',
      blocks: [
        { kind: 'booked', start: '6:00 AM', end: '7:30 AM', request: requestsByLane[0][0], fallbackTitle: 'ADC Project', fallbackSub: 'Blacktown' },
        { kind: 'buffer', start: '7:30 AM', end: '8:00 AM' },
        { kind: 'booked', start: '11:30 AM', end: '1:00 PM', request: requestsByLane[0][1], fallbackTitle: 'ProBuild Site', fallbackSub: 'North Ryde' },
        { kind: 'buffer', start: '1:00 PM', end: '1:30 PM' },
      ],
    },
    {
      id: 'truck-2',
      rego: 'ESS-318',
      truckLabel: '10T Truck',
      blocks: [
        { kind: 'booked', start: '6:00 AM', end: '9:00 AM', request: requestsByLane[1][0], fallbackTitle: 'Westmead Health', fallbackSub: 'Penrith' },
        { kind: 'buffer', start: '9:00 AM', end: '9:30 AM' },
        { kind: 'booked', start: '10:30 AM', end: '12:30 PM', request: requestsByLane[1][1], fallbackTitle: 'Lendlease Site', fallbackSub: 'Macquarie Park' },
        { kind: 'buffer', start: '12:30 PM', end: '1:00 PM' },
        { kind: 'booked', start: '1:00 PM', end: '3:30 PM', request: requestsByLane[1][2], fallbackTitle: 'Taylor Constructions', fallbackSub: 'Chatswood' },
      ],
    },
    {
      id: 'truck-3',
      rego: 'ESS-204',
      truckLabel: '6T Truck',
      blocks: [
        { kind: 'booked', start: '6:00 AM', end: '7:00 AM', request: requestsByLane[2][0], fallbackTitle: 'ADCO Works', fallbackSub: 'Liverpool' },
        { kind: 'buffer', start: '7:00 AM', end: '7:30 AM' },
        { kind: 'booked', start: '9:30 AM', end: '11:00 AM', request: requestsByLane[2][1], fallbackTitle: 'Bunnings Deliveries', fallbackSub: 'Bankstown' },
        { kind: 'buffer', start: '11:00 AM', end: '11:30 AM' },
        { kind: 'buffer', start: '2:00 PM', end: '2:30 PM' },
      ],
    },
  ];
}

export default function TruckSchedulePage() {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    materialOrderRequestsAPI.listActiveRequests()
      .then((items) => {
        if (!active) return;
        setRequests((items || []).filter((item) => item.scheduledAtIso));
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || 'Failed to load truck schedule.');
      });
    return () => { active = false; };
  }, []);

  const requestsByLane = useMemo(() => {
    const groups = [[], [], []];
    requests.forEach((request) => {
      groups[laneIndexForRequest(request)].push(request);
    });
    groups.forEach((group) => {
      group.sort((a, b) => String(a.scheduledAtIso || '').localeCompare(String(b.scheduledAtIso || '')));
    });
    return groups;
  }, [requests]);

  const lanes = useMemo(() => buildLaneTemplate(requestsByLane), [requestsByLane]);

  const openPdf = async (request) => {
    if (!request) return;
    try {
      const url = await materialOrderRequestsAPI.getPdfUrl(request);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Failed to open truck schedule PDF', error);
    }
  };

  return (
    <div className="truck-schedule-page">
      <div className="truck-schedule-header">
        <div>
          <h1>Truck Schedule</h1>
          <p>Live truck availability for ESS Transport from 6:00 AM to 4:00 PM.</p>
        </div>
        <button type="button" className="truck-schedule-filter-button">Filters</button>
      </div>

      <div className="truck-schedule-card">
        <div className="truck-schedule-card-header">
          <div>
            <div className="truck-schedule-eyebrow">LIVE TRUCK AVAILABILITY</div>
            <div className="truck-schedule-date">{todayHeadline()}</div>
          </div>
          <div className="truck-schedule-legend">
            <span><i className="booked" />Booked</span>
            <span><i className="buffer" />Travel Buffer</span>
          </div>
        </div>

        {error ? <div className="truck-schedule-error">{error}</div> : null}

        <div className="truck-schedule-board-wrap">
          <div className="truck-schedule-board">
            <div className="truck-schedule-time-header">
              <div className="truck-schedule-time-label">TIME</div>
              <div className="truck-schedule-time-markers">
                {TIME_MARKERS.map((marker) => (
                  <span key={marker}>{marker}</span>
                ))}
              </div>
            </div>

            <div className="truck-schedule-grid">
              {lanes.map((lane) => (
                <div key={lane.id} className="truck-schedule-row">
                  <div className="truck-schedule-truck-meta">
                    <div className="truck-schedule-truck-icon">🚚</div>
                    <div className="truck-schedule-truck-rego">{lane.rego}</div>
                    <div className="truck-schedule-truck-type">{lane.truckLabel}</div>
                  </div>
                  <div className="truck-schedule-slots">
                    <div className="truck-schedule-grid-lines">
                      {Array.from({ length: 5 }).map((_, index) => <span key={`${lane.id}-line-${index}`} />)}
                    </div>
                    <div className="truck-schedule-slot-row">
                      {lane.blocks.map((block) => {
                        const request = block.request;
                        const title = request?.builderName || block.fallbackTitle;
                        const subtitle = request?.projectName || block.fallbackSub;
                        return (
                          <button
                            key={`${lane.id}-${block.start}-${block.end}-${block.kind}`}
                            type="button"
                            className={`truck-schedule-slot ${block.kind}${request ? ' clickable' : ''}`}
                            style={{ flex: flexFor(block) }}
                            onClick={() => openPdf(request)}
                            disabled={!request}
                          >
                            <span className="truck-schedule-slot-time">{block.start} - {block.end}</span>
                            {block.kind === 'booked' ? (
                              <>
                                <span className="truck-schedule-slot-title">{title}</span>
                                <span className="truck-schedule-slot-subtitle">{subtitle}</span>
                              </>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="truck-schedule-help-card">
          <div className="truck-schedule-help-icon">i</div>
          <div>
            <strong>How to assign</strong>
            <p>Only scheduled deliveries and travel buffers are shown here for now.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
