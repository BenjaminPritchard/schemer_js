package main

import (
	"log"
	"net/http"
	"os"
	"sync"
)

// application-specific data
type sourceStruct struct {
	FirstName string
	LastName  string
	Age       int
	Float1    float32
	Float2    float64
	Bool1     bool
	Complex1  complex64
	Complex2  complex128
}

func (d *sourceStruct) GetData() interface{} {
	return d
}

// application-specific way to aquire data
func populateStruct(mu *sync.Mutex, structToEncode *sourceStruct) {

	counter := 0

	// in this example, we just populate with pretend data...
	for {
		mu.Lock()

		structToEncode.FirstName = "ben"
		structToEncode.LastName = "pritchard"
		structToEncode.Age = 42 + counter // goes to show: i'm not getting any younger!

		structToEncode.Float1 = 3.14159
		structToEncode.Float2 = 2.81828
		structToEncode.Bool1 = true
		structToEncode.Complex1 = 1 + 2i
		structToEncode.Complex2 = 3 + 4i

		counter++
		mu.Unlock()
	}
}

func main() {
	const DefaultPort = "8080"

	mu := new(sync.Mutex)
	structToEncode := sourceStruct{}

	port := os.Getenv("PORT")
	if port == "" {
		port = DefaultPort
	}

	// populate our struct asyncronously
	go populateStruct(mu, &structToEncode)

	// create the pointpoints for our struct
	mux := SchemerHandlerFor(&structToEncode, port, mu)

	// and server it
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
