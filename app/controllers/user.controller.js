import User from '../models/user.model';
import winston from '../../config/winston';

module.exports = {
    /**
     * Retrieve and return all Users from the database
     */
    findAll: (req, res) => {
        User.find({})
        .then(users => {
            res.send(users);
        }).catch(err => {
            winston.error("error: ", err);
            res.status(500).send({
                message: err.message || "Some error occurred while retrieving users."
            });
        });
    },
}