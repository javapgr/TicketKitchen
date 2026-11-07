import express, { type Express, type Request, type Response } from 'express';

const app: Express = express();
const port = 3000;


app.get('/', (req: Request, res: Response) => {
    res.send ("Hola, Mundo");
});

app.listen(port, () => {
    console.log("Ejemplo de la app corriendo en el puerto $(port)")
})
