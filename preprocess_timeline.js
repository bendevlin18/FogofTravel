#!/usr/bin/env node

/**
 * Preprocess a Google Takeout Timeline.json into a lightweight JSON file
 * containing only [lng, lat, timestamp] arrays.
 *
 * Usage: node preprocess_timeline.js /path/to/Timeline.json /path/to/output.json
 */

const fs = require('fs');

const inputPath = process.argv[2] || '/Users/bendevlin/Downloads/Timeline.json';
const outputPath = process.argv[3] || '/Users/bendevlin/Downloads/locations_export.json';

console.log(`Reading ${inputPath}...`);
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

function parseLatLngString(str) {
  const match = str.match(/([\d.-]+)°,\s*([\d.-]+)°/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lng, lat];
}

const points = [];

for (const seg of data.semanticSegments || []) {
  const segTs = seg.startTime ? new Date(seg.startTime).getTime() : null;

  if (seg.timelinePath) {
    for (const p of seg.timelinePath) {
      const coord = parseLatLngString(p.point);
      if (coord) {
        const ts = p.time ? new Date(p.time).getTime() : segTs;
        points.push([coord[0], coord[1], ts]);
      }
    }
  }

  if (seg.visit?.topCandidate?.placeLocation?.latLng) {
    const coord = parseLatLngString(seg.visit.topCandidate.placeLocation.latLng);
    if (coord) points.push([coord[0], coord[1], segTs]);
  }

  if (seg.activity?.start?.latLng) {
    const coord = parseLatLngString(seg.activity.start.latLng);
    if (coord) points.push([coord[0], coord[1], segTs]);
  }
  if (seg.activity?.end?.latLng) {
    const coord = parseLatLngString(seg.activity.end.latLng);
    if (coord) {
      const endTs = seg.endTime ? new Date(seg.endTime).getTime() : segTs;
      points.push([coord[0], coord[1], endTs]);
    }
  }
}

console.log(`Extracted ${points.length.toLocaleString()} points`);

// Write compact JSON — array of [lng, lat, timestamp] arrays
// This is ~10-15MB instead of 195MB
fs.writeFileSync(outputPath, JSON.stringify(points));

const stats = fs.statSync(outputPath);
console.log(`Written to ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
