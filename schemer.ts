/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
// schemer.ts - typescript schemer decoder
// this code is setup for run under node.js
// currently it includes the functionality to both:
//    1) fetch a schemer schema (in JSON format)
//    2) actually decode the data
// in the future, we want the decoding logic to be broken out
// into an isomorphic library for use in both NODE and on the browser somehow

"use strict";

let offset = 0;
let lastVarIntSize = 0;

// typesafe way to get "any" data into expected types
export class SchemerDecoder {
  private internal_data: Record<string, any>;

  constructor(data: Record<string, any>) {
    this.internal_data = data;
  }

  // either returns the named string, or throws an error if it doesn't exist or isn't compatible with a string
  GetString(strName: string): string {
    if (typeof this.internal_data[strName] !== "string") {
      throw new Error(`${strName} is not a string`);
    }
    if (this.internal_data[strName].length === 0) {
      throw new Error(`${strName} is does not exist`);
    }
    return this.internal_data[strName]; // guareteed to be a string
  }

  // either returns the named string, or throws an error if it doesn't exist or isn't compatible with a string
  GetNumber(strName: string): number {
    if (typeof this.internal_data[strName] !== "number") {
      throw new Error(`${strName} is not a number`);
    }
    if (this.internal_data[strName].length === 0) {
      throw new Error(`${strName} is does not exist`);
    }
    return this.internal_data[strName]; // guareteed to be a number
  }
}

/**
 * decode whole numbers from protobuf-style varint bytes
 * // adapted from: https://github.com/chrisdickinson/varint/blob/master/decode.js
 * @param varIntBytes - raw binary schemer-encoded data
 * @returns decoded raw int
 * @throws RangeError if varint cannot be decoded from the provided bytes
 */
function doVarIntDecode(varIntBytes: Uint8Array): number {
  const MSB = 0x80;
  const REST = 0x7f;

  let res = 0,
    shift = 0,
    counter = 0,
    b = 0;

  do {
    if (counter >= varIntBytes.length || shift > 49) {
      throw new RangeError("Could not decode varint");
    }
    b = varIntBytes[counter++];
    res += shift < 28 ? (b & REST) << shift : (b & REST) * Math.pow(2, shift);
    shift += 7;
  } while (b >= MSB);

  // set global variable indicating how many bytes were used to decode the varint
  lastVarIntSize = counter;

  return res;
}

/**
 * decoded varint
 * @param binaryData - raw binary schemer-encoded data
 * @param JSONschema - schemer schema defining the data, in JSON format
 * @throws error if invalid schema
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decodeVarInt(binaryData: Uint8Array, JSONschema: any): number {
  if (JSONschema.type != "int") throw new Error("invalid schema");

  const excerpt = binaryData.subarray(offset);

  // process and return an integer, decoded from an encoded varint
  // if the schema indicates it is a signed value, convert it
  // to a signed value (because we always encode unsigned ints)
  const uint = doVarIntDecode(excerpt);

  offset += lastVarIntSize;

  const unsigned = !(JSONschema.signed == "true");
  if (unsigned) return uint;

  // otherwise, convert into a signed int
  let intVal = uint >> 1;
  if (intVal & 0) intVal = ~intVal;
  return intVal;
}

/**
 * decodes a fixed length string
 * @param binaryData - raw binary schemer-encoded data
 * @param JSONschema - schemer schema defining the data, in JSON format
 * @throws error if invalid schema
 */
export function decodeFixedString(
  binaryData: Uint8Array,
  JSONschema: any
): string {
  if (JSONschema.type != "string") throw new Error("invalid schema");

  let excerpt = binaryData.subarray(offset);

  // first byte tells the length of the byte, in bytes
  // figure out the length of the string
  const n = doVarIntDecode(excerpt);
  offset += lastVarIntSize;

  // create an excerpt of the binary data that is exactly n bytes long
  excerpt = binaryData.subarray(offset, offset + n);
  const strValue = new TextDecoder("utf-8").decode(excerpt);

  // increate offset by length of the string
  offset += n;
  return strValue;
}

/**
 * decodes a float32 from schemer binary data
 * @param binaryData - raw binary schemer-encoded data
 * @param JSONschema - schemer schema defining the data, in JSON format
 * @throws error if invalid schema
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function decodeFloat32(binaryData: Uint8Array, JSONschema: any): number {
  if (JSONschema.type != "float")
    throw new Error("invalid schema; float expected");
  const excerpt = binaryData.subarray(offset, offset + 4);
  offset += 4;
  const rawData = new Uint8Array(excerpt);
  const view = new DataView(rawData.buffer);
  return view.getFloat32(0, true);
}

/**
 * decodes a float64 from schemer binary data
 * @param binaryData - raw binary schemer-encoded data
 * @param JSONschema - schemer schema defining the data, in JSON format
 * @throws error if invalid schema
 */
export function decodeFloat64(binaryData: Uint8Array, JSONschema: any): number {
  if (JSONschema.type != "float")
    throw new Error("invalid schema; float expected");
  const excerpt = binaryData.subarray(offset, offset + 8);
  offset += 8;
  const rawData = new Uint8Array(excerpt);
  const view = new DataView(rawData.buffer);
  return view.getFloat64(0, true);
}

/**
 * decodes a fixed object from schemer binary data
 * @param binaryData - raw binary schemer-encoded data
 * @param JSONschema - schemer schema defining the data, in JSON format
 * @returns SchemerDecoder - used to get type safe version of the decoded data
 * @throws error if invalid schema
 */
export function decodFixedObject(
  binaryData: Uint8Array,
  JSONschema: Record<string, any>
): SchemerDecoder {
  const workingValues: Record<string, any> = {};

  // loop through the schema, and decode each value
  for (let i = 0; i < JSONschema.fields.length; i++) {
    const fieldName: string = JSONschema.fields[i].name;
    const field: any = JSONschema.fields[i];

    switch (field.type) {
      case "string":
        workingValues[fieldName] = decodeFixedString(
          binaryData,
          JSONschema.fields[i]
        );
        break;

      case "int":
        workingValues[fieldName] = decodeVarInt(binaryData, field);
        break;

      case "float":
        if (field.bits == "32") {
          workingValues[fieldName] = decodeFloat32(binaryData, field);
        } else if (field.bits == "64") {
          workingValues[fieldName] = decodeFloat64(binaryData, field);
        } else {
          throw new Error("invalid schema; invalid floating point size");
        }
        break;
    }

    if (field.type == "float") {
      if (field.bits == "32") {
        workingValues[fieldName] = decodeFloat32(binaryData, field);
      } else if (field.bits == "64") {
        workingValues[fieldName] = decodeFloat64(binaryData, field);
      } else {
        throw new Error("invalid schema; invalid floating point size");
      }
    }
  }

  return new SchemerDecoder(workingValues);
}

// for the moment, we can ONLY decode fixed objects...
export function schemerDecode(
  binaryData: Uint8Array,
  JSONschema: Record<string, any>
): SchemerDecoder {
  return decodFixedObject(binaryData, JSONschema);
}
