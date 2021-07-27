/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
//
// TypeScript Version: 3.1
// schemer.ts - typescript schemer decoder
// this code is setup for run under node.js
// currently it includes the functionality to both:
//    1) fetch a schemer schema (in JSON format)
//    2) actually decode the data
// in the future, we want the decoding logic to be broken out
// into an isomorphic library for use in both NODE and on the browser somehow
// Benjamin Pritchard / iCompute Consulting

"use strict";

let offset = 0; // used to current offset into
let lastVarIntSize = 0;

export class ComplexNumber {
  public real: number;
  public imag: number;

  constructor(real: number, imag: number) {
    this.real = real;
    this.imag = imag;
  }

  ValueAsString() {
    return " `${this.real} + ${this.imag}i`";
  }
}

// typesafe way to get "any" data into expected types
export class SchemerDecoder {
  private internal_data: Record<string, any>;
  private JSONSchema: any;

  constructor(data: Record<string, any>, JSONSchema: any) {
    // internal data can be used to get a javascript object mapping field names to fields of type any
    // if using a typescript JSON decoder typesafe library, just pass this in as the "JSON" data.
    this.internal_data = data;
    // JSONSchema is the schema associated with this decoder
    this.JSONSchema = JSONSchema;
  }

  // if using this library from vanilla javascript, use the functions below to
  // return the decoded data in a typesafe way the best we can

  // either returns the named field, or throws an error if it doesn't exist or isn't compatible with a string
  GetString(strName: string): string {
    if (typeof this.internal_data[strName] !== "string") {
      throw new Error(`${strName} is not a string`);
    }
    if (this.internal_data[strName].length === 0) {
      throw new Error(`${strName} does not exist`);
    }
    return this.internal_data[strName]; // guaranteed to be a string
  }

  // either returns the named field, or throws an error if it doesn't exist or isn't compatible with a number
  GetNumber(strName: string): number {
    if (typeof this.internal_data[strName] !== "number") {
      throw new Error(`${strName} is not a number`);
    }
    if (this.internal_data[strName].length === 0) {
      throw new Error(`${strName} does not exist`);
    }
    return this.internal_data[strName]; // guaranteed to be a number
  }

  // either returns the named field, or throws an error if it doesn't exist or isn't compatible with a boolean
  GetBool(strName: string): boolean {
    if (typeof this.internal_data[strName] !== "boolean") {
      throw new Error(`${strName} is not a boolean`);
    }
    if (this.internal_data[strName].length === 0) {
      throw new Error(`${strName} does not exist`);
    }
    return this.internal_data[strName]; // guaranteed to be a boolean
  }

  // either returns the named field, or throws an error if it doesn't exist or isn't compatible with an object
  GetObject(strName: string): SchemerDecoder {
    if (typeof this.internal_data[strName] !== "object") {
      throw new Error(`${strName} is not a object`);
    }
    if (this.internal_data[strName].length === 0) {
      throw new Error(`${strName} does not exist`);
    }
    return this.internal_data[strName]; // guaranteed to be an object
  }

  // either returns the named field, or throws an error if it doesn't exist or isn't compatible with a ComplexNumber
  GetComplex(strName: string): ComplexNumber {
    if (
      typeof this.internal_data[strName] !== "object" ||
      this.internal_data[strName].constructor.name != "ComplexNumber"
    ) {
      throw new Error(`${strName} is not a ComplexNumber`);
    }
    if (this.internal_data[strName].length === 0) {
      throw new Error(`${strName} does not exist`);
    }
    return this.internal_data[strName]; // guaranteed to be a ComplexNumber
  }

  // either returns the named field, or throws an error if it doesn't exist or isn't compatible with an array
  GetArray(strName: string): any[] {
    if (
      typeof this.internal_data[strName] !== "object" ||
      this.internal_data[strName].constructor.name != "Array"
    ) {
      throw new Error(`${strName} is not an array`);
    }
    if (this.internal_data[strName].length === 0) {
      throw new Error(`${strName} does not exist`);
    }
    return this.internal_data[strName]; // guaranteed to be an array (of type any)
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
 * decode varint
 * @param binaryData - raw binary schemer-encoded data
 * @param JSONschema - schemer schema defining the data, in JSON format
 * @returns decoded varint as a number
 * @throws error if invalid schema
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decodeVarInt(binaryData: Uint8Array, JSONschema: any): number {
  //if (JSONschema.type != "int") throw new Error("invalid schema");

  const excerpt = binaryData.subarray(offset);

  // process and return an integer, decoded from an encoded varint
  // if the schema indicates it is a signed value, convert it
  // to a signed value (because we always encode unsigned ints)
  const uint = doVarIntDecode(excerpt);
  offset += lastVarIntSize;

  const signed = JSONschema.signed == "true";
  if (signed) return uint;

  // otherwise, convert into a signed int
  let intVal = uint >> 1;
  if (intVal & 0) intVal = ~intVal;
  return intVal;
}

/**
 * decodes a fixed length string
 * @param binaryData - raw binary schemer-encoded data
 * @param JSONschema - schemer schema defining the data, in JSON format
 * @returns decoded string as a string
 * @throws error if invalid schema
 */
function decodeFixedString(binaryData: Uint8Array, JSONschema: any): string {
  if (JSONschema.type != "string") throw new Error("invalid schema");

  let excerpt = binaryData.subarray(offset);

  // first byte tells the length of the byte, in bytes
  // figure out the length of the string
  const n = decodeVarInt(excerpt, JSONschema);

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
 * @param overRideSchema - boolean indicating whether or not to override the schema (to allow for use during complex number decoding)
 * @returns decoded float32 as a number
 * @throws error if invalid schema
 */
function decodeFloat32(
  binaryData: Uint8Array,
  JSONschema: any,
  overRideSchema?: boolean
): number {
  if (JSONschema.type != "float" && overRideSchema !== true)
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
 * @param overRideSchema - boolean indicating whether or not to override the schema (to allow for use during complex number decoding)
 * @returns decoded float64 as a number
 * @throws error if invalid schema
 */
function decodeFloat64(
  binaryData: Uint8Array,
  JSONschema: any,
  overRideSchema?: boolean
): number {
  if (JSONschema.type != "float" && overRideSchema !== true)
    throw new Error("invalid schema; float expected");
  const excerpt = binaryData.subarray(offset, offset + 8);
  offset += 8;
  const rawData = new Uint8Array(excerpt);
  const view = new DataView(rawData.buffer);
  return view.getFloat64(0, true);
}

/**
 * decodes a boolean from schemer binary data
 * @param binaryData - raw binary schemer-encoded data
 * @param JSONschema - schemer schema defining the data, in JSON format
 * @returns decoded boolean as a boolean
 * @throws error if invalid schema
 */
function decodeBool(binaryData: Uint8Array, JSONschema: any): boolean {
  if (JSONschema.type != "bool")
    throw new Error("invalid schema; bool expected");
  const retval = binaryData[offset] != 0;
  offset += 1;
  return retval;
}

/**
 * decodes a complex64 from schemer binary data
 * @param binaryData - raw binary schemer-encoded data
 * @param JSONschema - schemer schema defining the data, in JSON format
 * @returns decoded complex64 as a ComplexNumber
 * @throws error if invalid schema
 */
function decodeComplex64(
  binaryData: Uint8Array,
  JSONschema: any
): ComplexNumber {
  if (JSONschema.type != "complex")
    throw new Error("invalid schema; complex expected");
  const realPart = decodeFloat32(binaryData, JSONschema, true);
  const imaginaryPart = decodeFloat32(binaryData, JSONschema, true);
  return new ComplexNumber(realPart, imaginaryPart);
}

/**
 * decodes a complex128 from schemer binary data
 * @param binaryData - raw binary schemer-encoded data
 * @param JSONschema - schemer schema defining the data, in JSON format
 * @returns decoded complex64 as a ComplexNumber
 * @throws error if invalid schema
 */
function decodeComplex128(
  binaryData: Uint8Array,
  JSONschema: any
): ComplexNumber {
  if (JSONschema.type != "complex")
    throw new Error("invalid schema; complex expected");
  const realPart = decodeFloat64(binaryData, JSONschema, true);
  const imaginaryPart = decodeFloat64(binaryData, JSONschema, true);
  return new ComplexNumber(realPart, imaginaryPart);
}

/**
 * decodes a complex128 from schemer binary data
 * @param binaryData - raw binary schemer-encoded data
 * @param JSONschema - schemer schema defining the data, in JSON format
 * @returns decoded complex64 as a ComplexNumber
 * @throws error if invalid schema
 */
// NOTE: typesafety is lost here...
function decodeVarArray(binaryData: Uint8Array, JSONschema: any): any[] {
  if (JSONschema.type != "array")
    throw new Error("invalid schema; complex expected");
  if (JSONschema.length != undefined)
    throw new Error(
      "invalid schema; varArray schemas cannot have a length element"
    );
  const arraySize = decodeVarInt(binaryData, JSONschema);
  const array = new Array(arraySize);

  const fieldName =
    JSONschema.element.type == "object" ? JSONschema.element.name : "value";

  for (let i = 0; i < arraySize; i++) {
    const schemerDecoder = schemerDecode(binaryData, JSONschema.element);

    switch (JSONschema.element.type) {
      case "string":
        array[i] = schemerDecoder.GetString(fieldName);
        break;

      case "int":
        array[i] = schemerDecoder.GetNumber(fieldName);
        break;

      case "bool":
        array[i] = schemerDecoder.GetBool(fieldName);
        break;

      case "object":
        array[i] = schemerDecoder.GetObject(fieldName);
        break;

      case "complex":
        array[i] = schemerDecoder.GetComplex(fieldName);
        break;

      case "array":
        array[i] = schemerDecoder.GetArray(fieldName);
    }
  }

  return array;
}

/**
 * decodes a fixed object from schemer binary data
 * @param binaryData - raw binary schemer-encoded data
 * @param JSONschema - schemer schema defining the data, in JSON format
 * @returns SchemerDecoder - used to get type safe version of the decoded data
 * @throws error if invalid schema
 */
function decodFixedObject(
  binaryData: Uint8Array,
  JSONschema: Record<string, any>
): Record<string, any> {
  const workingValues: Record<string, any> = {};

  // loop through the schema, and decode each value
  for (let i = 0; i < JSONschema.fields.length; i++) {
    const fieldName: string = JSONschema.fields[i].name;
    const field: any = JSONschema.fields[i];
    const arrayType = "int";

    switch (field.type) {
      case "string":
        workingValues[fieldName] = decodeFixedString(
          binaryData,
          JSONschema.fields[i]
        );
        break;

      case "array":
        switch (arrayType) {
          case "int":
            workingValues[fieldName] = decodeVarArray(
              binaryData,
              JSONschema.fields[i]
            );
            break;
        }
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

      case "bool":
        workingValues[fieldName] = decodeBool(binaryData, field);
        break;

      case "complex":
        if (field.bits == "64") {
          workingValues[fieldName] = decodeComplex64(binaryData, field);
        } else if (field.bits == "128") {
          workingValues[fieldName] = decodeComplex128(binaryData, field);
        } else {
          throw new Error("invalid schema; invalid complex size");
        }
        break;

      default:
        console.log(`warning: skipped unsupported schema type ${field.type}`);
        break;
    }
  }

  return workingValues;
}

/**
 * decodes a value schemer binary data
 * @param binaryData - raw binary schemer-encoded data
 * @param JSONschema - schemer schema defining the data, in JSON format
 * @returns SchemerDecoder - used to get type safe version of the decoded data
 */
export function schemerDecode(
  binaryData: Uint8Array,
  JSONschema: Record<string, any>
): SchemerDecoder {
  const workingValues: Record<string, any> = {};

  switch (JSONschema.type) {
    case "object":
      return new SchemerDecoder(
        decodFixedObject(binaryData, JSONschema),
        JSONschema
      );
      break;

    case "string":
      workingValues["value"] = decodeFixedString(binaryData, JSONschema);
      break;

    case "int":
      workingValues["value"] = decodeVarInt(binaryData, JSONschema);
      break;

    case "float":
      if (JSONschema.bits == "32") {
        workingValues["value"] = decodeFloat32(binaryData, JSONschema);
      } else if (JSONschema.bits == "64") {
        workingValues["value"] = decodeFloat64(binaryData, JSONschema);
      } else {
        throw new Error("invalid schema; invalid floating point size");
      }
      break;

    case "bool":
      workingValues["value"] = decodeBool(binaryData, JSONschema);
      break;

    case "complex":
      if (JSONschema.bits == "64") {
        workingValues["value"] = decodeComplex64(binaryData, JSONschema);
      } else if (JSONschema.bits == "128") {
        workingValues["value"] = decodeComplex128(binaryData, JSONschema);
      } else {
        throw new Error("invalid schema; invalid complex size");
      }
      break;

    default:
      console.log(
        `warning: skipped unsupported schema type ${JSONschema.type}`
      );
      break;
  }

  return new SchemerDecoder(workingValues, JSONschema);
}

// uses the passed in SchemaDecoder to
export function PopulateStruct(
  struct: Record<string, any>,
  SchemaDecoder: SchemerDecoder
) {
  console.log(struct);
  console.log(SchemaDecoder);
}
