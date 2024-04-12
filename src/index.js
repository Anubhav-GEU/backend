// require('dotenv').config()
import dotenv from "dotenv";
import connectDB from './db/index.js';


dotenv.config({
    path: './env'
})

/*
import express from 'express';

const app = express();
// function connectDB() {}

// using ifi => executing immediately

;(async () => {
    try {
        await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
        app.on('error', (error) => {
            console.error('ERRR:', error);
            throw error
        })

        app.listen(process.env.PORT, () => {
            console.log(`App is listening on port ${process.env.PORT}`);
        })
    } catch (error) {
        console.error('error:', error);
        throw error
    }
})()
*/

connectDB()