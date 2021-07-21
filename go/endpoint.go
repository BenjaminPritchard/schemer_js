package main

import (
	"bytes"
	"log"
	"net/http"
	"sync"

	"github.com/bminer/schemer"
)

type DataInterface interface {
	GetData() interface{}
}

// SchemerHandlerFor sets up a schema and data endpoint for an arbitrary
// sourcestruct is the structure to encode
// port is port to server on via HTTP
// mu is mutex, which is acquired during the HTTP writes, with the idea that the mutex will also be
// acquired during application async updates of sourceStruct
func SchemerHandlerFor(data DataInterface, port string, mu *sync.Mutex) *http.ServeMux {

	// TODO: update to support endpoints for multiple structs

	sourceStruct := data.GetData()
	writerSchema := schemer.SchemaOf(sourceStruct)

	schemaEndPoint := "/get-schema/"
	dataEndPoint := "/get-data/"

	// setup our endpoints
	mux := http.NewServeMux()
	mux.HandleFunc(schemaEndPoint, getSchemaHanlder(writerSchema, mu))
	mux.HandleFunc(dataEndPoint, getDataHanlder(data, writerSchema, mu))

	log.Println("server listing on port", port)
	log.Println("endpont 1: ", schemaEndPoint)
	log.Println("endpont 2: ", dataEndPoint)

	return mux
}

func getSchemaHanlder(writerSchema schemer.Schema, mu *sync.Mutex) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {

		if req.Method != http.MethodGet {
			http.Error(w, "Invalid Invocation", http.StatusNotFound)
			return
		}

		mu.Lock()
		defer mu.Unlock()

		b, _ := writerSchema.MarshalJSON()
		log.Println(string(b))

		w.Header().Set("Access-Control-Allow-Origin", "*")
		_, err := w.Write(b)

		if err != nil {
			http.Error(w, "internal error: "+err.Error(), http.StatusInternalServerError)
			log.Println("i/o error: " + err.Error())
			return
		}

		log.Println("successfully returned binary schema")
	}
}

func getDataHanlder(data DataInterface, writerSchema schemer.Schema, mu *sync.Mutex) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {

		if req.Method != http.MethodGet {
			http.Error(w, "Invalid Invocation", http.StatusNotFound)
			return
		}

		mu.Lock()
		defer mu.Unlock()

		/*
			err := writerSchema.Encode(w, sourceStruct)
			if err != nil {
				http.Error(w, "internal error: "+err.Error(), http.StatusInternalServerError)
				return
			}
		*/

		sourceStruct := data.GetData()
		var encodedData bytes.Buffer

		err := writerSchema.Encode(&encodedData, sourceStruct)
		if err != nil {
			http.Error(w, "internal error: "+err.Error(), http.StatusInternalServerError)
			defer mu.Unlock()
			return
		}

		_, err = w.Write(encodedData.Bytes())
		log.Print(encodedData.Bytes())

		if err != nil {
			http.Error(w, "internal error: "+err.Error(), http.StatusInternalServerError)
			log.Println("i/o error: " + err.Error())
			return
		}

		log.Printf("successfully returned binary data")
	}
}
