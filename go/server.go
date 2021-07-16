package main

import (
	"fmt"
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
	Float1    float32
	Float2    float64
	Bool1     bool
	Complex1  complex64
	Complex2  complex64
}

var structToEncode = sourceStruct{}
var writerSchema = schemer.SchemaOf(&structToEncode)

var mu sync.Mutex

// for right this monent, just hard code some data
func populateStruct() {
	mu.Lock()
	defer mu.Unlock()

	structToEncode.FirstName = "ben"
	structToEncode.LastName = "pritchard"
	structToEncode.Age = 42

	structToEncode.Float1 = 3.14159
	structToEncode.Float2 = 2.81828
	structToEncode.Bool1 = true
	structToEncode.Complex1 = 1 + 2i
	structToEncode.Complex2 = 3 + 4i
}

func getSchemaHanlder() http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {

		if req.Method != http.MethodGet {
			http.Error(w, "Invalid Invocation", http.StatusNotFound)
			return
		}

		b, _ := writerSchema.MarshalJSON()
		fmt.Println(string(b))

		w.Header().Set("Access-Control-Allow-Origin", "*")
		_, err := w.Write(b)

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
		defer mu.Unlock()

		err := writerSchema.Encode(w, structToEncode)
		if err != nil {
			http.Error(w, "internal error: "+err.Error(), http.StatusInternalServerError)
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

	populateStruct()

	// setup our endpoints
	mux := http.NewServeMux()
	mux.HandleFunc("/get-schema/", getSchemaHanlder())
	mux.HandleFunc("/get-data/", getDataHanlder())

	log.Println("example server listing on port:", port)
	log.Println("endpont 1: /get-schema/")
	log.Println("endpont 2: /get-data/")

	log.Fatal(http.ListenAndServe(":"+port, mux))
}
