import * as schemer from "./schemer.js";
import fetch from "node-fetch";

const schemaURL = "http://localhost:8080/get-schema/";
const dataURL = "http://localhost:8080/get-data/";

// application specific-data to work with
class typedDecodedData {
  FirstName: string;
  LastName: string;
  Age: number;
  Float1: number;
  Float2: number;
}

// grab schema from server
// and decode it into a typed struct
function fetchAndDecode() {
  fetch(schemaURL)
    .then((res) => res.json())
    .then((json) => {
      fetch(dataURL)
        .then((res) => res.arrayBuffer())
        .then((buffer) => {
          const rawData = new Uint8Array(buffer);
          const schemaDecoder = schemer.schemerDecode(rawData, json);

          const decodedData = new typedDecodedData();
          decodedData.FirstName = schemaDecoder.GetString("FirstName");
          decodedData.LastName = schemaDecoder.GetString("LastName");
          decodedData.Age = schemaDecoder.GetNumber("Age");

          console.log(decodedData);
        });
    });
}

fetchAndDecode();
