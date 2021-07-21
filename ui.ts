import * as schemer from "./schemer.js";
import fetch from "node-fetch";

const schemaURL = "http://localhost:8080/get-schema/";
const dataURL = "http://localhost:8080/get-data/";

// application specific-data to work with
class typedDecodedData {
  FirstName: string;
  LastName: string;
  Age: number;
  IsMarried: boolean;
  Float1: number;
  Float2: number;
  Complex1: number;
  Complex2: number;
}

const decodedData = new typedDecodedData();

function populateTypedData(schemaDecoder: schemer.SchemerDecoder) {
  // populate the typed struct with the decoded data, ensuring type safety
  decodedData.FirstName = schemaDecoder.GetString("FirstName");
  decodedData.LastName = schemaDecoder.GetString("LastName");
  decodedData.Age = schemaDecoder.GetNumber("Age");
  decodedData.IsMarried = schemaDecoder.GetBool("Bool1");
  decodedData.Float1 = schemaDecoder.GetNumber("Float1");
  decodedData.Float2 = schemaDecoder.GetNumber("Float2");

  console.log(decodedData);
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
          console.log(json);
          const rawData = new Uint8Array(buffer);
          const schemaDecoder = schemer.schemerDecode(rawData, json);
          populateTypedData(schemaDecoder);
        });
    });
}

fetchAndDecode();
