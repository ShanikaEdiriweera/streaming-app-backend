import moment from 'moment';
import _ from 'lodash';
import Student from '../models/student.model';
import Attendance from '../models/attendance.model';
import HttpUtil from '../util/httpUtil';
import winston from '../../config/winston';

/**
 * attendance/date grade wise
 * attendance/date class wise 
 * attendance group by date
 * attendance group by date - date range
 */
module.exports = {
    /**
     * Create and Save a new Attendance record
     * Does not send ideamart request
     */
    create: async (req, res) => {
        const req_JSON_attencdance = req.body;
        // Validate request
        if( !req_JSON_attencdance.indexNo || 
            !req_JSON_attencdance.isEntered || 
            !req_JSON_attencdance.timestamp ) {
            
            return res.status(400).send({
                message: "Required Attendance record details can not be empty"
            });
        }

        // Find student record
        const student = await Student.findOne({ indexNo: req_JSON_attencdance.indexNo });
        if( !student ) return res.status(400).send({ message: `Student not found for index no. - ${req_JSON_attencdance.indexNo}` });

        // Create an Attendance record
        const attendance = new Attendance({
            student: student._id,
            indexNo: req_JSON_attencdance.indexNo,     
            date: req_JSON_attencdance.date,     
            time: req_JSON_attencdance.time,  
            timestamp: req_JSON_attencdance.timestamp,  
            isEntered: req_JSON_attencdance.isEntered
        });

        // Save Attendance record in the database
        try {
            const savedRecord = await attendance.save();
            const updatedStudent = await Student.findByIdAndUpdate(student._id, {$push: {attendance: savedRecord._id}}, {new: true});
            res.send({
                message: "SUCCESS",
                savedRecord,
                updatedStudent
            });
        } catch (err) {
            winston.error("error: ", err)
            res.status(500).send({
                message: err.message || "Some error occurred while creating the Attendance record.",
                error: err.code
            });
        }
    },

    /**
     * Retrieve and return all Attendance records from the database
     * Query params 'from: Date' or 'to: Date'  can be given
     */
    findAll: (req, res) => {
        if (req.query.to || req.query.from) {
            const recordsFrom = req.query.from ? new Date(req.query.from) : null;
            const recordsTo = req.query.to ? new Date(req.query.to) : null;
            winston.info(`Attendance records from: ${recordsFrom}, to: ${recordsTo}`)
            if (recordsFrom && !moment(recordsFrom).isValid()) return res.status(400).send({ 
                message: "Query parameter 'from' should be a valid date string."
            });
            if (recordsTo && !moment(recordsTo).isValid()) return res.status(400).send({ 
                message: "Query parameter 'to' should be a valid date string."
            });

            let query;
            if (recordsFrom && recordsTo) query = { date: {$gte: moment(recordsFrom), $lte: moment(recordsTo)}};
            else if (recordsFrom) query = { date: {$gte: moment(recordsFrom)}};
            else query = { date: {$lte: moment(recordsTo)}};
            
            Attendance.find(query)
            .then(records => {
                res.send(records);
            }).catch(err => {
                res.status(500).send({
                    message: err.message || "Some error occurred while retrieving Attendance records."
                });
            });
        } else {
            Attendance.find()
            .then(records => {
                res.send(records);
            }).catch(err => {
                res.status(500).send({
                    message: err.message || "Some error occurred while retrieving Attendance records."
                });
            });
        }
    },

    /**
     * Get Attendance report - student count of school, grade, class 
     * Query params 'from: Date' or 'to: Date'  can be given
     */
    getReport: async (req, res) => {
        if (req.query.to || req.query.from) {
            const reportFrom = req.query.from ? new Date(req.query.from) : null;
            const reportTo = req.query.to ? new Date(req.query.to) : null;
            winston.info(`Attendance report from: ${reportFrom}, to: ${reportTo}`)
            if (reportFrom && !moment(reportFrom).isValid()) return res.status(400).send({ 
                message: "Query parameter 'from' should be a valid date string."
            });
            if (reportTo && !moment(reportTo).isValid()) return res.status(400).send({ 
                message: "Query parameter 'to' should be a valid date string."
            });

            let query;

            if (reportFrom && reportTo) query = { date: {$gte: reportFrom, $lte: reportTo}};
            else if (reportFrom) query = { date: {$gte: reportFrom}};
            else query = { date: {$lte: reportTo}};
            winston.info("Attendance query: ", query)

            try {
                const recordsByDate = await Attendance.aggregate([
                    { $match : query }, 
                    { $lookup: {
                        from: 'students',
                        localField: 'student',
                        foreignField: '_id',
                        as: 'student'
                    }},
                    { $group: { 
                        _id: "$date", 
                        date: { $first: '$date' },
                        recordSet: { $addToSet: { indexNo: '$indexNo', student: '$student'} }, 
                    }},
                    { $sort : { date : 1 } },
                    { $project: { 
                        _id: 0, 
                        date: 1, 
                        recordSet: 1,
                    }}
                ]);

                winston.info("records: ", recordsByDate)
                let report = {};
                for (let item of recordsByDate) {
                    // Note: aggregate $lookup gives an array
                    const date = moment(item.date).format('YYYY-MM-DD'); 
                    report[date] = {}; 
                    const attendanceByGrade = _.countBy(item.recordSet, (record) => {
                        return record.student[0]["grade"];
                    })
                    const attendanceByClass = _.countBy(item.recordSet, (record) => {
                        return record.student[0].section;
                    })
                    report[date].total = item.recordSet.length;
                    report[date].attendanceByGrade = attendanceByGrade;
                    report[date].attendanceByClass = attendanceByClass;
                }
                winston.info("report: ", report)

                res.send({
                    reportFrom: moment(reportFrom).format('YYYY-MM-DD'),
                    reportTo: moment(reportTo).format('YYYY-MM-DD'), 
                    noOfDays: recordsByDate.length,
                    report
                });

            } catch (err) {
                res.status(500).send({
                    message: err.message || "Some error occurred while retrieving Attendance records."
                });
            }
        } else {
            try {
                const records = await Attendance.aggregate([ 
                    { $group: { 
                        _id: {indexNo: "$indexNo", date: "$date"}, 
                        indexNo: { $first: '$indexNo' }, 
                        // student: { $first: '$student' }, 
                        date: { $first: '$date' }
                    }},
                    // { $lookup: {
                    //     from: 'students',
                    //     localField: 'student',
                    //     foreignField: '_id',
                    //     as: 'student'
                    // }},
                    { $sort : { date : 1 } },
                    { $project: { 
                        _id: 0, 
                        indexNo: 1, 
                        date: 1, 
                        // student: 1 
                    }}
                ]);
                winston.info("records: ", records)
                const report = _.countBy(records, (record) => {
                    return moment(record.date).format('YYYY-MM-DD');
                })
                res.send({
                    report
                });

            } catch (err) {
                res.status(500).send({
                    message: err.message || "Some error occurred while retrieving Attendance records."
                });
            }
        }
    },
}