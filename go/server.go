package main

import (
	"bytes"
	"log"
	"net/http"
	"os"
	"sync"

	"github.com/bminer/schemer"
)

const DefaultPort = "8080"

type sourceStruct struct {
	FirstName string
	LastName  string
	Age       int
}

var structToEncode = sourceStruct{}
var writerSchema = schemer.SchemaOf(&structToEncode)
var binaryWriterSchema, _ = writerSchema.MarshalJSON()

var mu sync.Mutex

// for right this monent, just hard code some data
func asyncUpdate() {
	mu.Lock()
	defer mu.Unlock()

	structToEncode.FirstName = "ben"
	structToEncode.LastName = "pritchard"
	structToEncode.Age = 4
}

func getSchemaHanlder() http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {

		if req.Method != http.MethodGet {
			http.Error(w, "Invalid Invocation", http.StatusNotFound)
			return
		}

		//origin := req.Header.Get("Origin")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		buf := bytes.NewBuffer(binaryWriterSchema)
		_, err := w.Write(buf.Bytes())

		if err != nil {
			http.Error(w, "internal error: "+err.Error(), http.StatusInternalServerError)
			log.Println("i/o error: " + err.Error())
			return
		}

		log.Printf("successfully returned binary schema")
	}
}

func getDataHanlder() http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {

		if req.Method != http.MethodGet {
			http.Error(w, "Invalid Invocation", http.StatusNotFound)
			return
		}

		mu.Lock()

		var encodedData bytes.Buffer
		err := writerSchema.Encode(&encodedData, structToEncode)
		if err != nil {
			http.Error(w, "internal error: "+err.Error(), http.StatusInternalServerError)
			defer mu.Unlock()
			return
		}

		mu.Unlock()

		_, err = w.Write(encodedData.Bytes())
		log.Print(encodedData.Bytes())
		//log.Printf("%d bytes written ", n)

		if err != nil {
			http.Error(w, "internal error: "+err.Error(), http.StatusInternalServerError)
			log.Println("i/o error: " + err.Error())
			return
		}

		log.Printf("successfully returned binary data")
	}
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = DefaultPort
	}

	// constantly write out new data
	go asyncUpdate()

	// setup our endpoints
	mux := http.NewServeMux()
	mux.HandleFunc("/get-schema/", getSchemaHanlder())
	mux.HandleFunc("/get-data/", getDataHanlder())

	log.Println("example server listing on port:", port)
	log.Println("endpont 1: /get-schema/")
	log.Println("endpont 2: /get-data/")

	log.Fatal(http.ListenAndServe(":"+port, mux))
}
