#!/usr/bin/node

// schemer.js
// javascript schemer decoded
// this code is setup for run under node.js
// currently it includes the functionality to both:
//    1) fetch a schemer schema, and associated binary data
//    2) actually decode the data
// in the future, we want the decoding logic to be broken out
// into an isomorphic library for use in both NODE and on the browser

"use strict";

const fetch = require("node-fetch");

let offset = 0;
let lastVarIntSize = 0;

// this routine taken from: https://github.com/chrisdickinson/varint/blob/master/decode.js
function doVarIntDecode(buf, offset) {
  var MSB = 0x80;
  var REST = 0x7f;

  var res = 0,
    offset = offset || 0,
    shift = 0,
    counter = offset,
    b,
    l = buf.length;

  do {
    if (counter >= l || shift > 49) {
      read.bytes = 0;
      throw new RangeError("Could not decode varint");
    }
    b = buf[counter++];
    res += shift < 28 ? (b & REST) << shift : (b & REST) * Math.pow(2, shift);
    shift += 7;
  } while (b >= MSB);

  lastVarIntSize = counter - offset;

  return res;
}

function decodeVarInt(binaryData, schema) {
  if (schema.type != "int") throw new Error("invalid schema");

  let excerpt = binaryData.subarray(offset);

  // process and return an integer, decoded from an encoded varint
  // if the schema indicates it is a signed value, convert it
  // to a signed value (because we always encode unsigned ints)
  let uint = doVarIntDecode(excerpt);
  offset += lastVarIntSize;

  let unsigned = !(schema.signed == "true");
  if (unsigned) return uint;

  // otherwise, convert into a signed int
  let intVal = uint >> 1;
  if (intVal & (1 != 0)) intVal = ~intVal;
  return intVal;
}

function decodeFixedString(binaryData, schema) {
  if (schema.type != "string") throw new Error("invalid schema");

  let excerpt = binaryData.subarray(offset);

  // first byte tells the length of the byte, in bytes
  // figure out the length of the string
  let n = doVarIntDecode(excerpt);
  offset += lastVarIntSize;

  // create an excerpt of the binary data that is exactly n bytes long
  excerpt = binaryData.subarray(offset, offset + n);
  let strValue = new TextDecoder("utf-8").decode(excerpt);

  // increate offset by length of the string
  offset += n;
  return strValue;
}

// returns an object populated with the schemer binary data.
// the passed in schema (which must be in JSON format) is used
// to decode the binary data.
function decodFixedObject(JSONschema, binaryData) {
  let obj;
  let retVal = {};

  // loop through the schema, and decode each value
  for (let i = 0; i < JSONschema.fields.length; i++) {
    let fieldName = JSONschema.fields[i].name;

    if (JSONschema.fields[i].type == "string") {
      retVal[fieldName] = decodeFixedString(binaryData, JSONschema.fields[i]);
    }

    if (JSONschema.fields[i].type == "int") {
      retVal[fieldName] = decodeVarInt(binaryData, JSONschema.fields[i]);
    }
  }

  return retVal;
}

// for the moment, we can ONLY decode fixed objects...
function schemerDecode(JSONschema, binaryData) {
  // FIXME
  return decodFixedObject(JSONschema, binaryData);
}

function fetchAndDecode() {
  fetch("http://localhost:8080/get-schema/")
    .then((res) => res.json())
    .then((json) => {
      fetch("http://localhost:8080/get-data/")
        .then((res) => res.buffer())
        .then((buffer) => {
          let rawData = new Uint8Array(buffer);
          let obj = schemerDecode(json, rawData);
          console.log(obj);
        });
    });
}

fetchAndDecode();
